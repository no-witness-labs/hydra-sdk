import { Cluster } from "@no-witness-labs/hydra-devnet";
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
// Test Suite
// ---------------------------------------------------------------------------

/**
 * End-to-end Hydra Head lifecycle test using real Docker containers.
 *
 * Uses @no-witness-labs/hydra-sdk Head API against a live devnet cluster
 * to verify the Init → Open → Close → Fanout lifecycle for hydra-node v2,
 * which opens heads directly without a separate Initializing phase.
 *
 * Every state transition is driven by the SDK — no manual polling needed:
 * - `head.init()` resolves when HeadIsOpen is received
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

  it("full lifecycle: init → open → close → fanout", async () => {
    const head = await Head.create({ url: cluster.hydraApiUrl });

    try {
      // 1. SDK connects and receives Greetings → state is Idle
      expect(head.getState()).toBe("Idle");

      // 2. init() sends Init and awaits HeadIsOpen (v2 opens directly)
      await head.init();
      expect(head.getState()).toBe("Open");

      // 3. close() sends Close and awaits HeadIsClosed
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
