import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { KeyHash } from "@evolution-sdk/evolution";
import { Assets, Transaction } from "@evolution-sdk/evolution";
import { makeTxBuilder } from "@evolution-sdk/evolution/sdk/builders/TransactionBuilder";
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sign and submit a draft commit transaction on L1. */
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

/** Draft an empty commit via hydra-sdk Provider, sign, and submit to L1. */
async function commitEmpty(cluster: Cluster.Cluster): Promise<void> {
  const draftTx = (await Effect.runPromise(
    Provider.postCommit(cluster.hydraHttpUrl, {}),
  )) as { cborHex: string };

  await writeFile(
    join(cluster.tempDir!, "commit-draft.json"),
    JSON.stringify(draftTx),
  );
  await signAndSubmitCommit(cluster);
}

/**
 * Commit funded UTxOs into the head.
 *
 * 1. Derive payment address
 * 2. Split genesis UTxO: 10 ADA for commit, rest stays as L1 fuel
 * 3. Build blueprint tx for the 10 ADA UTxO
 * 4. POST /commit via hydra-sdk Provider
 * 5. Sign and submit the draft commit tx
 */
async function commitFunds(cluster: Cluster.Cluster): Promise<void> {
  const magic = cluster.config.cardanoNode.networkMagic;
  const exec = (cmd: string) =>
    Container.exec(cluster.cardanoNode!, ["sh", "-c", cmd]);

  // 1. Get payment address
  const addr = (
    await exec(
      "cardano-cli conway address build" +
        " --payment-verification-key-file /opt/cardano/config/payment.vkey" +
        ` --testnet-magic ${magic}`,
    )
  ).trim();

  // 2. Query current UTxOs
  await exec(
    "cardano-cli conway query utxo" +
      ` --address ${addr}` +
      " --socket-path /opt/cardano/ipc/node.socket" +
      ` --testnet-magic ${magic}` +
      " --out-file /tmp/utxos.json",
  );
  const utxoJson = JSON.parse(
    await Container.exec(cluster.cardanoNode!, ["cat", "/tmp/utxos.json"]),
  );

  const firstRef = Object.keys(utxoJson)[0];
  if (!firstRef) throw new Error("No UTxOs found for payment address");

  // 3. Split: send 10 ADA to self (for commit), change stays as fuel
  const commitLovelace = 10_000_000;
  await exec(
    "cardano-cli conway transaction build" +
      ` --socket-path /opt/cardano/ipc/node.socket` +
      ` --testnet-magic ${magic}` +
      ` --tx-in ${firstRef}` +
      ` --tx-out ${addr}+${commitLovelace}` +
      ` --change-address ${addr}` +
      " --out-file /tmp/split.json",
  );
  await exec(
    "cardano-cli conway transaction sign" +
      " --tx-file /tmp/split.json" +
      " --signing-key-file /opt/cardano/config/payment.skey" +
      " --out-file /tmp/split-signed.json",
  );
  await exec(
    "cardano-cli conway transaction submit" +
      " --tx-file /tmp/split-signed.json" +
      " --socket-path /opt/cardano/ipc/node.socket" +
      ` --testnet-magic ${magic}`,
  );

  // Wait for split tx to confirm
  await new Promise((r) => setTimeout(r, 3_000));

  // 4. Re-query UTxOs, find the 10 ADA output
  await exec(
    "cardano-cli conway query utxo" +
      ` --address ${addr}` +
      " --socket-path /opt/cardano/ipc/node.socket" +
      ` --testnet-magic ${magic}` +
      " --out-file /tmp/utxos2.json",
  );
  const utxoJson2 = JSON.parse(
    await Container.exec(cluster.cardanoNode!, ["cat", "/tmp/utxos2.json"]),
  );

  // Pick the smallest UTxO (the 10 ADA one) to commit
  const sorted = Object.entries(utxoJson2).sort(
    (a, b) =>
      (a[1] as { value: { lovelace: number } }).value.lovelace -
      (b[1] as { value: { lovelace: number } }).value.lovelace,
  );
  const [commitRef, commitUtxoData] = sorted[0];
  const commitAddr = (commitUtxoData as { address: string }).address;
  const commitVal = (commitUtxoData as { value: { lovelace: number } }).value
    .lovelace;

  // 5. Build blueprint tx for the commit UTxO (fee=0, all value to same addr)
  const [cHash, cIx] = commitRef.split("#");
  await exec(
    "cardano-cli conway transaction build-raw" +
      ` --tx-in ${cHash}#${cIx}` +
      ` --tx-out ${commitAddr}+${commitVal}` +
      " --fee 0" +
      " --out-file /tmp/blueprint.json",
  );
  const blueprintEnvelope = JSON.parse(
    await Container.exec(cluster.cardanoNode!, ["cat", "/tmp/blueprint.json"]),
  );

  // 6. POST /commit via hydra-sdk Provider
  const draftTx = (await Effect.runPromise(
    Provider.postCommit(cluster.hydraHttpUrl, {
      blueprintTx: blueprintEnvelope,
      utxo: {
        [commitRef]: {
          address: commitAddr,
          value: { lovelace: commitVal },
        },
      },
    }),
  )) as { cborHex: string };

  await writeFile(
    join(cluster.tempDir!, "commit-draft.json"),
    JSON.stringify(draftTx),
  );

  // 7. Sign and submit the draft
  await signAndSubmitCommit(cluster);
}

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
// Test Suite
// ---------------------------------------------------------------------------

describe("Hydra SDK — Head Lifecycle Integration", () => {
  let cluster: Cluster.Cluster;

  beforeAll(async () => {
    cluster = makeCluster("hydra-sdk-lifecycle", {
      node: 9002,
      submit: 9091,
      api: 9402,
      peer: 9502,
      mon: 9602,
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
  // 1. Full lifecycle: connect → init → commit → open → close → fanout
  // -------------------------------------------------------------------------
  it("full lifecycle: init → commit → open → close → fanout", async () => {
    const head = await Head.create({ url: cluster.hydraApiUrl });

    try {
      expect(head.getState()).toBe("Idle");

      await head.init();
      expect(head.getState()).toBe("Initializing");

      const events = head.subscribeEvents();
      await commitEmpty(cluster);

      for await (const event of events) {
        if (event.tag === "HeadIsOpen") break;
      }
      expect(head.getState()).toBe("Open");

      await head.close();
      expect(head.getState()).toBe("Closed");

      await head.fanout();
      expect(head.getState()).toBe("Final");
    } finally {
      await head.dispose();
    }
  }, 600_000);

  // -------------------------------------------------------------------------
  // 2. NewTx: commit funds → open → submit valid L2 tx via HydraProvider
  // -------------------------------------------------------------------------
  it("newTx succeeds with a valid L2 transaction", async () => {
    // Fresh cluster since the previous test finalized
    await cluster.remove();
    cluster = makeCluster("hydra-sdk-newtx", {
      node: 9006,
      submit: 9095,
      api: 9406,
      peer: 9506,
      mon: 9606,
    });
    await cluster.start();

    const head = await Head.create({ url: cluster.hydraApiUrl });
    const hydraProvider = new Provider.HydraProvider({
      head,
      httpUrl: cluster.hydraHttpUrl,
    });

    try {
      await head.init();

      // Commit real UTxOs so the head has funds to transact
      const events = head.subscribeEvents();
      await commitFunds(cluster);
      for await (const event of events) {
        if (event.tag === "HeadIsOpen") break;
      }
      expect(head.getState()).toBe("Open");

      // Query L2 UTxOs via HydraProvider
      const l2Utxos = await hydraProvider.getSnapshotUtxos();
      expect(l2Utxos.length).toBeGreaterThan(0);

      // Build unsigned tx using evolution-sdk: send funds back to same address
      const firstUtxo = l2Utxos[0];
      const lovelace = Assets.lovelaceOf(firstUtxo.assets);
      const utxoAddr = firstUtxo.address;
      const paymentCred = utxoAddr.paymentCredential;
      if (paymentCred._tag !== "KeyHash") {
        throw new Error("Expected KeyHash credential");
      }
      const built = await makeTxBuilder({
        provider: hydraProvider,
        network: "Custom",
      })
        .payToAddress({
          address: utxoAddr,
          assets: Assets.fromLovelace(lovelace),
        })
        .addSigner({ keyHash: paymentCred as KeyHash.KeyHash })
        .build({
          changeAddress: utxoAddr,
          availableUtxos: l2Utxos,
          drainTo: 0,
        });

      const unsignedTx = await built.toTransaction();
      const unsignedCbor = Transaction.toCBORHex(unsignedTx);

      // Write unsigned CBOR to container, sign with cardano-cli, read back
      await Container.exec(cluster.cardanoNode!, [
        "sh",
        "-c",
        `echo '{"type":"Tx ConwayEra","description":"Ledger Cddl Format","cborHex":"${unsignedCbor}"}' > /tmp/l2-unsigned.json`,
      ]);
      await Container.exec(cluster.cardanoNode!, [
        "sh",
        "-c",
        "cardano-cli conway transaction sign" +
          " --tx-file /tmp/l2-unsigned.json" +
          " --signing-key-file /opt/cardano/config/payment.skey" +
          " --out-file /tmp/l2-signed.json",
      ]);
      const signedEnvelope = JSON.parse(
        await Container.exec(cluster.cardanoNode!, [
          "cat",
          "/tmp/l2-signed.json",
        ]),
      );
      const signedTx = Transaction.fromCBORHex(signedEnvelope.cborHex);

      // Submit via HydraProvider (exercises both Provider and Head.newTx)
      await hydraProvider.submitTx(signedTx);

      // Head stays Open after a successful transaction
      expect(head.getState()).toBe("Open");
    } finally {
      await head.dispose();
    }
  }, 600_000);
});

describe("Hydra SDK — Abort Path", () => {
  let cluster: Cluster.Cluster;

  beforeAll(async () => {
    cluster = makeCluster("hydra-sdk-abort", {
      node: 9003,
      submit: 9092,
      api: 9403,
      peer: 9503,
      mon: 9603,
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
  // 2. Abort path: init → abort
  // -------------------------------------------------------------------------
  it("init → abort transitions to Aborted", async () => {
    const head = await Head.create({ url: cluster.hydraApiUrl });

    try {
      expect(head.getState()).toBe("Idle");

      await head.init();
      expect(head.getState()).toBe("Initializing");

      await head.abort();
      expect(head.getState()).toBe("Aborted");
    } finally {
      await head.dispose();
    }
  }, 600_000);
});

describe("Hydra SDK — Event Subscription", () => {
  let cluster: Cluster.Cluster;

  beforeAll(async () => {
    cluster = makeCluster("hydra-sdk-events", {
      node: 9004,
      submit: 9093,
      api: 9404,
      peer: 9504,
      mon: 9604,
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
  // 3. Event subscription: verify callback subscription delivers events
  // -------------------------------------------------------------------------
  it("subscribe() delivers lifecycle events via callback", async () => {
    const head = await Head.create({ url: cluster.hydraApiUrl });
    const collectedTags: Array<string> = [];

    try {
      // Subscribe synchronously before any command — guarantees no events missed
      const unsub = head.subscribe((event: { tag: string }) => {
        collectedTags.push(event.tag);
      });

      // init() only resolves after HeadIsInitializing is received and dispatched,
      // so by this point the callback has already been invoked
      await head.init();
      unsub();

      expect(collectedTags).toContain("HeadIsInitializing");
    } finally {
      await head.dispose();
    }
  }, 600_000);
});

describe("Hydra SDK — Reconnection", () => {
  let cluster: Cluster.Cluster;

  beforeAll(async () => {
    cluster = makeCluster("hydra-sdk-reconnect", {
      node: 9005,
      submit: 9094,
      api: 9405,
      peer: 9505,
      mon: 9605,
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
  // 4. Reconnection: disconnect and reconnect preserves state
  // -------------------------------------------------------------------------
  it("reconnects after hydra-node restart and preserves state", async () => {
    const head = await Head.create({
      url: cluster.hydraApiUrl,
      reconnect: {
        maxRetries: 10,
        initialDelayMs: 200,
        maxDelayMs: 5_000,
      },
    });

    try {
      expect(head.getState()).toBe("Idle");

      await head.init();
      expect(head.getState()).toBe("Initializing");

      // Restart hydra-node to force disconnect + reconnect
      await Container.stop(cluster.hydraNode!);
      await Container.start(cluster.hydraNode!);

      // Wait for reconnection + Greetings with restored state
      await new Promise((r) => setTimeout(r, 15_000));
      expect(head.getState()).toBe("Initializing");

      // Prove the connection is live by executing a command that requires
      // a working WebSocket — abort() sends Abort and awaits HeadIsAborted
      await head.abort();
      expect(head.getState()).toBe("Aborted");
    } finally {
      await head.dispose();
    }
  }, 600_000);
});
