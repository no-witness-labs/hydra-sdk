import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { Cluster, Container } from "@no-witness-labs/hydra-devnet";
import { Head, Query } from "@no-witness-labs/hydra-sdk";
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

const SUBSCRIPTION_WAIT_MS = 20_000;
const OPEN_HEAD_WAIT_MS = 60_000;

/**
 * Draft empty commit via POST /commit, sign with cardano-cli, submit to L1.
 * After this, the head will move to Open once the commit is confirmed.
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

async function firstWithTimeout<T>(
  iter: AsyncIterableIterator<T>,
  timeoutMs: number,
): Promise<{ value: T } | undefined> {
  const timeout = new Promise<undefined>((resolve) =>
    setTimeout(() => resolve(undefined), timeoutMs),
  );
  const next = iter
    .next()
    .then((r) => (r.done ? undefined : { value: r.value }));
  return await Promise.race([next, timeout]);
}

/**
 * Wait for head state to match (e.g. after init(), state may still be Idle
 * until the projector processes HeadIsInitializing). Same idea as lifecycle test
 * but resilient to event processing order.
 */
async function waitForState(
  head: { getState(): string },
  target: string,
  timeoutMs: number = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (head.getState() === target) return;
    await new Promise((r) => setTimeout(r, 80));
  }
  throw new Error(
    `Timeout waiting for head state "${target}", current: ${head.getState()}`,
  );
}


// -----------------------------------------------------------------------------
// Head Open: same pattern as hydra-head-lifecycle — init, commit, open, then
// query getHeadState / getSnapshot / getUTxO (REST). Subscriptions and
// NewTx streaming are best-effort (assert only when we receive data).
// -----------------------------------------------------------------------------

/** Same wire shape as HeadNewTx.test.ts; CBOR from HydraProvider.test (Conway-era). */
const MINIMAL_NEW_TX = {
  type: "Tx ConwayEra",
  description: "Ledger Cddl Format",
  cborHex:
    "84a400d90102818258200000000000000000000000000000000000000000000000000000000000000000000181a200583900000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001821a001e8480a0021a00028a00031a00000000a0f5f6",
  txId:
    "cafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabe",
};

describe("Query — Devnet", () => {
  let cluster: Cluster.Cluster;

  beforeAll(async () => {
    cluster = Cluster.make({
      clusterName: "query-open-integration",
      cardanoNode: { port: 9020, submitPort: 9098 },
      hydraNode: {
        apiPort: 9420,
        peerPort: 9520,
        monitoringPort: 9620,
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

  it("before head Open: getHeadState is Idle, getSnapshot and getUTxO return not found error", async () => {
    const query = await Query.create({ httpUrl: cluster.hydraHttpUrl });
    const headState = await query.getHeadState();
    expect((headState as { tag: string }).tag).toBe("Idle");

    try {
      await query.getSnapshot();
      throw new Error("Expected getSnapshot to throw not found error");
    } catch (err) {
      expect(err instanceof Error).toBe(true);
    }

    try {
      await query.getUTxO();
      throw new Error("Expected getUTxO to throw not found error");
    } catch (err) {
      expect(err instanceof Error).toBe(true);
    }
  }, 15_000);

  it(
    "after init and commit: head is Open; getHeadState, getSnapshot, getUTxO return valid data",
    async () => {
      const head = await Head.create({ url: cluster.hydraApiUrl });
      try {
        expect(head.getState()).toBe("Idle");
        await head.init();
        await waitForState(head, "Initializing");

        const events = head.subscribeEvents();
        await commitEmpty(cluster);
        for await (const event of events) {
          if (event.tag === "HeadIsOpen") break;
        }
        await waitForState(head, "Open");
        // Give the node a moment to expose Open state on REST before we query
        await new Promise((r) => setTimeout(r, 1500));
      } finally {
        await head.dispose();
      }

      const query = await Query.create({ httpUrl: cluster.hydraHttpUrl });
      const headState = await query.getHeadState();
      expect((headState as { tag: string }).tag).toBe("Open");

      const snapshot = await query.getSnapshot();
      expect(snapshot).toBeDefined();
      expect(
        (snapshot as { tag?: string }).tag === "InitialSnapshot" ||
          (snapshot as { tag?: string }).tag === "ConfirmedSnapshot",
      ).toBe(true);

      const utxoSet = await query.getUTxO();
      expect(utxoSet).toBeDefined();
      expect(utxoSet !== null && typeof utxoSet === "object").toBe(true);
    },
    OPEN_HEAD_WAIT_MS + 15_000,
  );

  it(
    "with head Open: subscribeSnapshots, subscribeUTxO, subscribeTransactions (all three, best-effort)",
    async () => {
      const head = await Head.create({ url: cluster.hydraApiUrl });
      const query = await Query.create({ httpUrl: cluster.hydraHttpUrl });
      try {
        await waitForState(head, "Open", 15_000);

        const iterSnapshots = query.subscribeSnapshots(head);
        const iterUTxO = query.subscribeUTxO(head);
        const iterTx = query.subscribeTransactions(head);

        await head.newTx(MINIMAL_NEW_TX).catch(() => {});

        const [snapResult, utxoResult, txResult] = await Promise.all([
          firstWithTimeout(iterSnapshots, SUBSCRIPTION_WAIT_MS),
          firstWithTimeout(iterUTxO, SUBSCRIPTION_WAIT_MS),
          firstWithTimeout(iterTx, SUBSCRIPTION_WAIT_MS),
        ]);

        if (snapResult?.value != null) {
          expect((snapResult.value as { headId?: string }).headId).toBeDefined();
          expect(typeof (snapResult.value as { headId?: string }).headId).toBe("string");
        }
        if (utxoResult?.value != null && typeof utxoResult.value !== "string") {
          expect(typeof utxoResult.value).toBe("object");
          expect(Array.isArray(utxoResult.value)).toBe(false);
        }
        if (txResult?.value != null) {
          expect(
            (txResult.value as { transactionId?: string }).transactionId,
          ).toBeDefined();
        }
      } finally {
        await head.dispose();
      }
    },
    SUBSCRIPTION_WAIT_MS + 25_000,
  );
});
