import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { Cluster, Container } from "@no-witness-labs/hydra-devnet";
import { Head } from "@no-witness-labs/hydra-sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Fast Shelley genesis config for testing.
 * Produces blocks every 20ms instead of default 1s (50x faster).
 * Same configuration used in evolution-sdk integration tests.
 */
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
async function commitEmpty(cluster: Cluster.Cluster): Promise<void> {
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

  await writeFile(join(cluster.tempDir!, "commit-draft.json"), draftTx);

  await Container.exec(cluster.cardanoNode!, [
    "sh",
    "-c",
    "cardano-cli conway transaction sign" +
      " --tx-file /opt/cardano/config/commit-draft.json" +
      " --signing-key-file /opt/cardano/config/payment.skey" +
      " --out-file /tmp/commit-signed.json",
  ]);

  await Container.exec(cluster.cardanoNode!, [
    "sh",
    "-c",
    "cardano-cli conway transaction submit" +
      " --tx-file /tmp/commit-signed.json" +
      " --socket-path /opt/cardano/ipc/node.socket" +
      ` --testnet-magic ${cluster.config.cardanoNode.networkMagic}`,
  ]);
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

/**
 * End-to-end Hydra Head lifecycle test using real Docker containers.
 *
 * Uses @no-witness-labs/hydra-sdk Head API against a live devnet cluster
 * to verify the full Init → Commit → Open → Close → Fanout lifecycle.
 *
 * Every state transition is driven by the SDK — no manual polling needed:
 * - `head.init()` resolves when HeadIsInitializing is received
 * - `head.subscribeEvents()` awaits HeadIsOpen after external L1 commit
 * - `head.close()` resolves when HeadIsClosed is received
 * - `head.fanout()` awaits ReadyToFanout then resolves on HeadIsFinalized
 */
describe("Hydra Head Lifecycle — DevNet Integration", () => {
  let cluster: Cluster.Cluster;

  beforeAll(async () => {
    cluster = Cluster.make({
      clusterName: "hydra-lifecycle-test",
      cardanoNode: { port: 9001, submitPort: 9090 },
      hydraNode: {
        apiPort: 9401,
        peerPort: 9501,
        monitoringPort: 9601,
        contestationPeriod: 3,
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

  it("full lifecycle: init → commit → open → close → fanout", async () => {
    const head = await Head.create({ url: cluster.hydraApiUrl });

    try {
      // 1. SDK connects and receives Greetings → state is Idle
      expect(head.getState()).toBe("Idle");

      // 2. init() sends Init and awaits HeadIsInitializing
      await head.init();
      expect(head.getState()).toBe("Initializing");

      // 3. Commit empty UTxO set to L1 (external REST + cardano-cli flow)
      //    Then use SDK event stream to await HeadIsOpen from the hydra-node.
      const events = head.subscribeEvents();
      await commitEmpty(cluster);

      // SDK's event stream delivers HeadIsOpen once L1 confirms the commit
      for await (const event of events) {
        if (event.tag === "HeadIsOpen") break;
      }
      expect(head.getState()).toBe("Open");

      // 4. close() sends Close and awaits HeadIsClosed
      await head.close();
      expect(head.getState()).toBe("Closed");

      // 5. fanout() awaits ReadyToFanout then sends Fanout and awaits HeadIsFinalized
      await head.fanout();
      expect(head.getState()).toBe("Final");
    } finally {
      await head.dispose();
    }
  }, 600_000);
});
