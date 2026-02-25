import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { Head } from "@no-witness-labs/hydra-sdk";
import { Effect } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type HeadStatus = Head.HeadStatus;
type HydraHead = Head.HydraHead;

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
 * Retry a close operation with exponential backoff.
 * Handles transient `PostTxOnChainFailed` when the L1 UTxO set isn't settled.
 */
async function retryClose(
  closeFn: () => Promise<void>,
  maxAttempts = 5,
  baseDelayMs = 2_000,
): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await closeFn();
      return;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("PostTxOnChainFailed") || attempt === maxAttempts) {
        throw err;
      }
      const delay = baseDelayMs * attempt;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
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
// Promise API
// ---------------------------------------------------------------------------

describe("Head Integration — Promise API", () => {
  let cluster: any;

  beforeAll(async () => {
    const { Cluster } = await import("@no-witness-labs/hydra-devnet");
    cluster = Cluster.make({
      clusterName: "head-promise",
      cardanoNode: { port: 7001, submitPort: 7090 },
      hydraNode: {
        apiPort: 7401,
        peerPort: 7501,
        monitoringPort: 7601,
        contestationPeriod: 3,
      },
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

  it(
    "full lifecycle: init → commit → close → fanout",
    async () => {
      const head = await Head.create({ url: cluster.hydraApiUrl });

      try {
        await waitForState(head, "Idle");
        expect(head.getState()).toBe("Idle");

        await head.init();
        expect(head.getState()).toBe("Initializing");

        await commitEmpty(cluster);
        await waitForState(head, "Open");
        expect(head.getState()).toBe("Open");

        await retryClose(() => head.close());
        expect(head.getState()).toBe("Closed");

        await head.fanout();
        expect(head.getState()).toBe("Final");
      } finally {
        await head.dispose();
      }
    },
    300_000,
  );
});

// ---------------------------------------------------------------------------
// Effect API
// ---------------------------------------------------------------------------

describe("Head Integration — Effect API", () => {
  let cluster: any;

  beforeAll(async () => {
    const { Cluster } = await import("@no-witness-labs/hydra-devnet");
    cluster = Cluster.make({
      clusterName: "head-effect",
      cardanoNode: { port: 7002, submitPort: 7190 },
      hydraNode: {
        apiPort: 7402,
        peerPort: 7502,
        monitoringPort: 7602,
        contestationPeriod: 3,
      },
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

  it(
    "full lifecycle: init → commit → close → fanout",
    async () => {
      const head = await Effect.runPromise(
        Head.effect.create({ url: cluster.hydraApiUrl }),
      );

      try {
        await waitForState(head, "Idle");
        expect(head.getState()).toBe("Idle");

        await Effect.runPromise(head.effect.init());
        expect(head.getState()).toBe("Initializing");

        await commitEmpty(cluster);
        await waitForState(head, "Open");
        expect(head.getState()).toBe("Open");

        await retryClose(() => Effect.runPromise(head.effect.close()));
        expect(head.getState()).toBe("Closed");

        await Effect.runPromise(head.effect.fanout());
        expect(head.getState()).toBe("Final");
      } finally {
        await Effect.runPromise(head.effect.dispose());
      }
    },
    300_000,
  );
});

// ---------------------------------------------------------------------------
// Layer API (Effect + DI)
// ---------------------------------------------------------------------------

describe("Head Integration — Layer API", () => {
  let cluster: any;

  beforeAll(async () => {
    const { Cluster } = await import("@no-witness-labs/hydra-devnet");
    cluster = Cluster.make({
      clusterName: "head-layer",
      cardanoNode: { port: 7003, submitPort: 7290 },
      hydraNode: {
        apiPort: 7403,
        peerPort: 7503,
        monitoringPort: 7603,
        contestationPeriod: 3,
      },
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

  it(
    "full lifecycle: init → commit → close → fanout",
    async () => {
      const head = await Effect.runPromise(
        Head.effect.create({ url: cluster.hydraApiUrl }),
      );

      try {
        // Resolve the service tag — demonstrates that programs written
        // against HydraHeadService work when wired up manually.
        const program = Effect.gen(function* () {
          const h = yield* Head.HydraHeadService;

          yield* Effect.promise(() => waitForState(h, "Idle"));
          expect(h.getState()).toBe("Idle");

          yield* h.effect.init();
          expect(h.getState()).toBe("Initializing");

          yield* Effect.promise(() => commitEmpty(cluster));
          yield* Effect.promise(() => waitForState(h, "Open"));
          expect(h.getState()).toBe("Open");

          yield* Effect.promise(() =>
            retryClose(() => Effect.runPromise(h.effect.close())),
          );
          expect(h.getState()).toBe("Closed");

          yield* h.effect.fanout();
          expect(h.getState()).toBe("Final");
        });

        await Effect.runPromise(
          program.pipe(
            Effect.provideService(Head.HydraHeadService, head),
          ),
        );
      } finally {
        await Effect.runPromise(head.effect.dispose());
      }
    },
    300_000,
  );
});
