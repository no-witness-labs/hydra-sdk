/**
 * Query integration tests. Uses real HTTP against a Hydra node
 * (HYDRA_HTTP_URL or hydra-devnet cluster). Run with:
 *   HYDRA_HTTP_URL=http://127.0.0.1:4001 pnpm exec vitest run test/Query/QueryIntegration
 *
 * Tests run in parallel. One subscription test covers all three streams (UTxO, snapshots, tx)
 * with first-value-only wait (~20s max).
 */
import { Head, Query } from "@no-witness-labs/hydra-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const realFetch = globalThis.fetch;

const mustReceive = process.env.HYDRA_SUBSCRIPTION_MUST_RECEIVE === "1";

/** Wait for first value from each subscription (or timeout). One success per stream is enough. */
const SUBSCRIPTION_WAIT_MS = 20_000;

async function withRealNode(
  fn: (opts: { httpUrl: string; wsUrl: string }) => Promise<void>,
): Promise<void> {
  const envUrl = process.env.HYDRA_HTTP_URL;
  if (envUrl) {
    const wsUrl = envUrl.replace(/^https?:/, (s) =>
      s === "https:" ? "wss:" : "ws:",
    );
    await fn({ httpUrl: envUrl, wsUrl });
    return;
  }
  const { Cluster } = await import("@no-witness-labs/hydra-devnet");
  const cluster = Cluster.make({
    clusterName: "query-integration",
    cardanoNode: { port: 7010, submitPort: 7019 },
    hydraNode: {
      apiPort: 7410,
      peerPort: 7510,
      monitoringPort: 7610,
      contestationPeriod: 3,
    },
  });
  await cluster.start();
  try {
    await fn({
      httpUrl: cluster.hydraHttpUrl,
      wsUrl: cluster.hydraApiUrl,
    });
  } finally {
    await cluster.remove();
  }
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

describe("Query integration — real node", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", realFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.skipIf(!process.env.HYDRA_HTTP_URL)(
    "getHeadState returns valid response from real node",
    async () => {
      await withRealNode(async ({ httpUrl }) => {
        const query = await Query.create({ httpUrl });
        const headState = await query.getHeadState();
        expect(headState).toBeDefined();
        expect(typeof (headState as { tag?: string }).tag).toBe("string");
        expect(["Idle", "Initial", "Open", "Closed"]).toContain(
          (headState as { tag: string }).tag,
        );
      });
    },
    15_000,
  );

  it.skipIf(!process.env.HYDRA_HTTP_URL)(
    "getSnapshot returns valid response from real node",
    async () => {
      await withRealNode(async ({ httpUrl }) => {
        const query = await Query.create({ httpUrl });
        const snapshot = await query.getSnapshot();
        expect(snapshot).toBeDefined();
        expect(
          (snapshot as { tag?: string }).tag === "InitialSnapshot" ||
            (snapshot as { tag?: string }).tag === "ConfirmedSnapshot",
        ).toBe(true);
      });
    },
    15_000,
  );

  it.skipIf(!process.env.HYDRA_HTTP_URL)(
    "getUTxO returns valid response from real node",
    async () => {
      await withRealNode(async ({ httpUrl }) => {
        const query = await Query.create({ httpUrl });
        const utxo = await query.getUTxO();
        expect(utxo).toBeDefined();
        expect(typeof utxo).toBe("object");
        expect(Array.isArray(utxo)).toBe(false);
      });
    },
    15_000,
  );

  it.skipIf(!process.env.HYDRA_HTTP_URL)(
    "subscribeUTxO + subscribeSnapshots + subscribeTransactions (one head, first value or timeout)",
    async () => {
      await withRealNode(async ({ httpUrl, wsUrl }) => {
        const query = await Query.create({ httpUrl });
        const head = await Head.create({ url: wsUrl });
        try {
          const iterUTxO = query.subscribeUTxO(head);
          const iterSnapshots = query.subscribeSnapshots(head);
          const iterTx = query.subscribeTransactions(head);

          const [utxoResult, snapshotResult, txResult] = await Promise.all([
            firstWithTimeout(iterUTxO, SUBSCRIPTION_WAIT_MS),
            firstWithTimeout(iterSnapshots, SUBSCRIPTION_WAIT_MS),
            firstWithTimeout(iterTx, SUBSCRIPTION_WAIT_MS),
          ]);

          if (utxoResult) {
            if (typeof utxoResult.value !== "string") {
              expect(typeof utxoResult.value).toBe("object");
              expect(Array.isArray(utxoResult.value)).toBe(false);
            }
          } else {
            if (mustReceive) expect(utxoResult).toBeDefined();
          }

          if (snapshotResult) {
            expect(snapshotResult.value).toBeDefined();
            expect(typeof (snapshotResult.value as { headId?: string }).headId).toBe("string");
          } else {
            if (mustReceive) expect(snapshotResult).toBeDefined();
          }

          if (txResult) {
            expect(txResult.value).toBeDefined();
            expect(typeof (txResult.value as { transactionId?: string }).transactionId).toBe("string");
          } else {
            if (mustReceive) expect(txResult).toBeDefined();
          }
        } finally {
          await head.dispose();
        }
      });
    },
    SUBSCRIPTION_WAIT_MS + 10_000,
  );
});
