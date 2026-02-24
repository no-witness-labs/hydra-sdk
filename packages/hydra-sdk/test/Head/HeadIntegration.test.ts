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
 * Commit via HTTP REST API (single-party, empty UTxO set).
 * Hydra's `POST /commit` accepts a JSON body of UTxOs to commit.
 * For an empty commit this opens the head immediately.
 */
async function commitViaHttp(httpUrl: string): Promise<void> {
  const response = await fetch(`${httpUrl}/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!response.ok) {
    throw new Error(
      `Commit failed: ${response.status} ${await response.text()}`,
    );
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
  // Promise API
  // -------------------------------------------------------------------------

  describe("Promise API", () => {
    it(
      "full lifecycle: init → commit(HTTP) → close → fanout",
      async () => {
        const head = await Head.create({ url: cluster.hydraApiUrl });

        try {
          // 1. Should start Idle after Greetings
          await waitForState(head, "Idle");
          expect(head.getState()).toBe("Idle");

          // 2. Init — transitions to Initializing
          await head.init();
          expect(head.getState()).toBe("Initializing");

          // 3. Commit via HTTP — transitions to Open
          await commitViaHttp(cluster.hydraHttpUrl);
          await waitForState(head, "Open");
          expect(head.getState()).toBe("Open");

          // 4. Close — transitions to Closed
          await head.close();
          expect(head.getState()).toBe("Closed");

          // 5. Fanout — internally awaits ReadyToFanout, then finalizes
          await head.fanout();
          expect(head.getState()).toBe("Final");
        } finally {
          await head.dispose();
        }
      },
      300_000,
    );
  });

  // -------------------------------------------------------------------------
  // Effect API
  // -------------------------------------------------------------------------

  describe("Effect API", () => {
    it(
      "full lifecycle: init → commit(HTTP) → close → fanout",
      async () => {
        const head = await Head.create({ url: cluster.hydraApiUrl });

        try {
          await waitForState(head, "Idle");

          await Effect.runPromise(head.effect.init());
          expect(head.getState()).toBe("Initializing");

          await commitViaHttp(cluster.hydraHttpUrl);
          await waitForState(head, "Open");

          await Effect.runPromise(head.effect.close());
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

  // -------------------------------------------------------------------------
  // Effect + DI (Layer)
  // -------------------------------------------------------------------------

  describe("Effect + DI (Layer)", () => {
    it(
      "full lifecycle via HydraHeadService layer",
      async () => {
        const config = { url: cluster.hydraApiUrl };

        const program = Effect.gen(function* () {
          const head = yield* Head.HydraHeadService;

          // Wait for Idle
          yield* Effect.tryPromise(() => waitForState(head, "Idle"));

          // Init
          yield* head.effect.init();
          expect(head.getState()).toBe("Initializing");

          // Commit via HTTP
          yield* Effect.tryPromise(() =>
            commitViaHttp(cluster.hydraHttpUrl),
          );
          yield* Effect.tryPromise(() => waitForState(head, "Open"));

          // Close
          yield* head.effect.close();
          expect(head.getState()).toBe("Closed");

          // Fanout
          yield* head.effect.fanout();
          expect(head.getState()).toBe("Final");
        }).pipe(Effect.provide(Head.layer(config)), Effect.scoped);

        await Effect.runPromise(program);
      },
      300_000,
    );
  });
});
