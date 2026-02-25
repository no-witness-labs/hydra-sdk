import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { Head } from "@no-witness-labs/hydra-sdk";
import { Effect } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type HeadStatus = Head.HeadStatus;
type HydraHead = Head.HydraHead;

// ---------------------------------------------------------------------------
// Fast Shelley genesis — 20ms slots for quick contestation periods
// ---------------------------------------------------------------------------

const FAST_SHELLEY_GENESIS = {
  activeSlotsCoeff: 1.0,
  epochLength: 50,
  slotLength: 0.02,
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Draft a commit tx via HTTP, sign it with cardano-cli, and submit to L1.
 *
 * Hydra's `POST /commit` returns a **draft** transaction that the client
 * must sign and submit to the Cardano L1. For an empty commit (single-party,
 * no UTxOs) the flow is:
 *   1. POST /commit with {} → draft tx (CBOR text envelope)
 *   2. Write draft tx to host tempDir (visible inside cardano-node container)
 *   3. cardano-cli sign inside the container (reads from ro mount, writes /tmp)
 *   4. cardano-cli submit inside the container
 */
async function commitEmpty(cluster: {
  hydraHttpUrl: string;
  tempDir: string;
  cardanoNode: { id: string; name: string };
  config: { cardanoNode: { networkMagic: number } };
}): Promise<void> {
  const { Container } = await import("@no-witness-labs/hydra-devnet");

  // 1. Draft the commit tx
  const response = await fetch(`${cluster.hydraHttpUrl}/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!response.ok) {
    throw new Error(
      `Commit draft failed: ${response.status} ${await response.text()}`,
    );
  }
  const draftTx = await response.text();

  // 2. Write draft tx to host tempDir (bind-mounted as /opt/cardano/config:ro)
  await writeFile(join(cluster.tempDir, "commit-draft.json"), draftTx);

  // 3. Sign inside the cardano-node container
  await Container.exec(cluster.cardanoNode, [
    "sh",
    "-c",
    "cardano-cli conway transaction sign" +
      " --tx-file /opt/cardano/config/commit-draft.json" +
      " --signing-key-file /opt/cardano/config/payment.skey" +
      " --out-file /tmp/commit-signed.json",
  ]);

  // 4. Submit to L1
  await Container.exec(cluster.cardanoNode, [
    "sh",
    "-c",
    "cardano-cli conway transaction submit" +
      " --tx-file /tmp/commit-signed.json" +
      " --socket-path /opt/cardano/ipc/node.socket" +
      ` --testnet-magic ${cluster.config.cardanoNode.networkMagic}`,
  ]);
}

/**
 * Poll `head.getState()` until it matches `target` or timeout expires.
 */
async function waitForState(
  head: HydraHead,
  target: HeadStatus,
  timeoutMs = 60_000,
): Promise<void> {
  const start = Date.now();
  while (head.getState() !== target) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(
        `Timed out waiting for state ${target} (current: ${head.getState()})`,
      );
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("Head Integration (devnet)", () => {
  // Dynamically imported to avoid loading dockerode/tar-stream when skipped
  let cluster: any;

  beforeAll(async () => {
    const { Cluster } = await import("@no-witness-labs/hydra-devnet");

    cluster = Cluster.make({
      clusterName: "head-integration",
      cardanoNode: { port: 7001, submitPort: 7090 },
      hydraNode: {
        apiPort: 7401,
        peerPort: 7501,
        monitoringPort: 7601,
        contestationPeriod: 1,
      },
      shelleyGenesisOverrides: FAST_SHELLEY_GENESIS,
    });
    await cluster.start();
  }, 300_000);

  afterAll(async () => {
    try {
      await cluster?.remove();
    } catch {
      // Best-effort cleanup
    }
  }, 120_000);

  // -------------------------------------------------------------------------
  // Single lifecycle exercising all three API styles:
  //   Promise API  → init + commit
  //   Effect API   → close
  //   Layer API    → fanout (via HydraHeadService)
  // -------------------------------------------------------------------------

  it(
    "full lifecycle: init → commit → close → fanout across API styles",
    async () => {
      const head = await Head.create({ url: cluster.hydraApiUrl });

      try {
        // -- Promise API: init + commit --
        await waitForState(head, "Idle");
        expect(head.getState()).toBe("Idle");

        await head.init();
        expect(head.getState()).toBe("Initializing");

        await commitEmpty(cluster);
        await waitForState(head, "Open");
        expect(head.getState()).toBe("Open");

        // -- Effect API: close --
        await Effect.runPromise(head.effect.close());
        expect(head.getState()).toBe("Closed");

        // -- Effect API: fanout (awaits ReadyToFanout internally) --
        await Effect.runPromise(head.effect.fanout());
        expect(head.getState()).toBe("Final");
      } finally {
        await head.dispose();
      }
    },
    300_000,
  );
});
