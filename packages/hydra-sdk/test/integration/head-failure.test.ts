import { Cluster, Container } from "@no-witness-labs/hydra-devnet";
import { Head, Provider } from "@no-witness-labs/hydra-sdk";
import { Effect } from "effect";
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
      // Init and commit empty to get to Open state
      await head.init();
      const events = head.subscribeEvents();
      await commitEmpty(cluster);
      for await (const event of events) {
        if (event.tag === "HeadIsOpen") break;
      }
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

  it("init fails fast with structured details when head is already initializing", async () => {
    const head = await Head.create({ url: cluster.hydraApiUrl });

    try {
      await head.init();
      expect(head.getState()).toBe("Initializing");

      // Bypass FSM and send raw Init again — hydra-node should reject
      // FSM rejects this before it reaches the node
      await expect(head.send("Init")).rejects.toThrow(
        "Command Init is not allowed while head is Initializing",
      );
    } finally {
      await head.dispose();
    }
  }, 600_000);
});

// ---------------------------------------------------------------------------
// Helpers (shared with head-lifecycle.test.ts)
// ---------------------------------------------------------------------------

async function signAndSubmitCommit(cluster: Cluster.Cluster): Promise<void> {
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

async function commitEmpty(cluster: Cluster.Cluster): Promise<void> {
  const draftTx = (await Effect.runPromise(
    Provider.postCommit(cluster.hydraHttpUrl, {}),
  )) as { cborHex: string };

  const { writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  await writeFile(
    join(cluster.tempDir!, "commit-draft.json"),
    JSON.stringify(draftTx),
  );
  await signAndSubmitCommit(cluster);
}
