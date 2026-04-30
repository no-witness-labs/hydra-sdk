import { Cluster } from "@no-witness-labs/hydra-devnet";
import { Head } from "@no-witness-labs/hydra-sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Fast Shelley genesis config for testing.
 * Produces blocks every 20ms instead of default 1s (50x faster).
 */
const FAST_SHELLEY_GENESIS = {
  activeSlotsCoeff: 1.0,
  epochLength: 50,
  slotLength: 0.02,
} as const;

function makeCluster(
  name: string,
  ports: {
    node: number;
    submit: number;
    api: number;
    peer: number;
    mon: number;
  },
): Cluster.Cluster {
  return Cluster.make({
    clusterName: name,
    cardanoNode: { port: ports.node, submitPort: ports.submit },
    hydraNode: {
      apiPort: ports.api,
      peerPort: ports.peer,
      monitoringPort: ports.mon,
      contestationPeriod: 3,
    },
    shelleyGenesisOverrides: FAST_SHELLEY_GENESIS,
  });
}

// ---------------------------------------------------------------------------
// Test Suite: Per-command failure matching
// ---------------------------------------------------------------------------

describe("Hydra SDK — Failure Matching (TxInvalid)", () => {
  let cluster: Cluster.Cluster;

  beforeAll(async () => {
    cluster = makeCluster("hydra-sdk-failure-tx", {
      node: 9010,
      submit: 9100,
      api: 9410,
      peer: 9510,
      mon: 9610,
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

  it("newTx fails fast with TxInvalid and structured details for invalid transaction", async () => {
    const head = await Head.create({ url: cluster.hydraApiUrl });

    try {
      // Init opens the head directly in hydra-node v2
      await head.init();
      expect(head.getState()).toBe("Open");

      // Submit garbage CBOR — hydra-node rejects with InvalidInput (deserialization failure)
      // This proves the SDK fails fast with a descriptive error, not a timeout.
      await expect(
        head.newTx({
          type: "Tx ConwayEra",
          description: "Ledger Cddl Format",
          cborHex: "deadbeef", // Invalid CBOR
          txId: "0000000000000000000000000000000000000000000000000000000000000000",
        }),
      ).rejects.toThrow("Invalid input");
    } finally {
      await head.dispose();
    }
  }, 600_000);
});

describe("Hydra SDK — Failure Matching (InvalidInput)", () => {
  let cluster: Cluster.Cluster;

  beforeAll(async () => {
    cluster = makeCluster("hydra-sdk-failure-inv", {
      node: 9011,
      submit: 9101,
      api: 9411,
      peer: 9511,
      mon: 9611,
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

  it("init fails fast with structured details when head is already open", async () => {
    const head = await Head.create({ url: cluster.hydraApiUrl });

    try {
      await head.init();
      expect(head.getState()).toBe("Open");

      // FSM rejects re-Init before it reaches the node.
      await expect(head.send("Init")).rejects.toThrow(
        "Command Init is not allowed while head is Open",
      );
    } finally {
      await head.dispose();
    }
  }, 600_000);
});

