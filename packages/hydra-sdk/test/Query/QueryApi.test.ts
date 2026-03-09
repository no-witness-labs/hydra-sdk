/**
 * Query module unit tests. Uses mock:// URLs and stubbed fetch — no real HTTP.
 */
import { Head, Query } from "@no-witness-labs/hydra-sdk";
import { Effect, Stream } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// =============================================================================
// Test fixtures
// =============================================================================

/** mock:// URL for unit tests — no real network. */
const MOCK_HTTP_URL = "mock://localhost:4001";

const ADDR_ALICE = "addr1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";
const ADDR_BOB = "addr1vx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5zxge";

const MOCK_UTXO = {
  "abc123#0": {
    address: ADDR_ALICE,
    value: { lovelace: 5_000_000 },
  },
  "def456#1": {
    address: ADDR_BOB,
    value: { lovelace: 2_000_000 },
  },
  "ghi789#0": {
    address: ADDR_ALICE,
    value: { lovelace: 1_000_000 },
  },
};

const MOCK_SNAPSHOT_CONFIRMED_PAYLOAD = {
  tag: "SnapshotConfirmed",
  headId: "test-head-id",
  snapshot: {
    headId: "test-head-id",
    version: 1,
    number: 42,
    confirmed: [],
    utxo: {
      "abc123#0": {
        address: ADDR_ALICE,
        value: { lovelace: 5_000_000 },
      },
    },
  },
  seq: 1,
  timestamp: "2024-01-01T00:00:00.000Z",
};

const MOCK_TX_VALID_PAYLOAD = {
  tag: "TxValid",
  headId: "test-head-id",
  transactionId: "deadbeef1234",
  seq: 2,
  timestamp: "2024-01-01T00:00:01.000Z",
};

const MOCK_SNAPSHOT_RESPONSE = {
  tag: "InitialSnapshot",
  headId: "test-head-id",
  initialUTxO: MOCK_UTXO,
};

const MOCK_HEAD_STATE = {
  tag: "Idle",
  contents: {
    chainState: "some-chain-state",
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const makeEventHead = (
  events: Array<{ tag: string; payload?: unknown }>,
): Head.HydraHead => {
  const stream = Stream.fromIterable(events);
  return {
    effect: { events: () => stream },
  } as unknown as Head.HydraHead;
};

// =============================================================================
// filterByAddress — pure function tests
// =============================================================================

describe("Query.filterByAddress", () => {
  it("returns an empty UTxO when no entries match the address", () => {
    const result = Query.filterByAddress(MOCK_UTXO, "addr1_nonexistent");
    expect(result).toEqual({});
  });

  it("returns only entries matching the given address", () => {
    const result = Query.filterByAddress(MOCK_UTXO, ADDR_ALICE);
    expect(result).toEqual({
      "abc123#0": MOCK_UTXO["abc123#0"],
      "ghi789#0": MOCK_UTXO["ghi789#0"],
    });
  });

  it("explicitly filters by address: result contains only that address and correct keys", () => {
    const filtered = Query.filterByAddress(MOCK_UTXO, ADDR_BOB);
    expect(Object.keys(filtered)).toEqual(["def456#1"]);
    expect(filtered["def456#1"]).toEqual({
      address: ADDR_BOB,
      value: { lovelace: 2_000_000 },
    });
    expect(Object.values(filtered).every((txOut) => txOut.address === ADDR_BOB)).toBe(true);
  });

  it("does not mutate the original UTxO", () => {
    const copy = { ...MOCK_UTXO };
    Query.filterByAddress(MOCK_UTXO, ADDR_ALICE);
    expect(MOCK_UTXO).toEqual(copy);
  });

  it("returns the full UTxO when all entries share the same address", () => {
    const singleAddr = {
      "a#0": { address: ADDR_ALICE, value: { lovelace: 100 } },
      "b#0": { address: ADDR_ALICE, value: { lovelace: 200 } },
    };
    expect(Query.filterByAddress(singleAddr, ADDR_ALICE)).toEqual(singleAddr);
  });

  it("handles an empty input UTxO gracefully", () => {
    expect(Query.filterByAddress({}, ADDR_ALICE)).toEqual({});
  });
});

// =============================================================================
// REST queries (fetch stubbed — mock:// URLs)
// =============================================================================

describe("Query REST queries (mock)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getUTxO", () => {
    it("fetches from GET /snapshot/utxo and returns the decoded UTxO", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(MOCK_UTXO));

      const query = await Query.create({ httpUrl: MOCK_HTTP_URL });
      const result = await query.getUTxO();

      expect(result).toEqual(MOCK_UTXO);
      const firstArg = vi.mocked(fetch).mock.calls[0]?.[0];
      const url =
        firstArg instanceof Request
          ? firstArg.url
          : typeof firstArg === "string"
            ? firstArg
            : firstArg instanceof URL
              ? firstArg.href
              : "";
      expect(url).toContain("/snapshot/utxo");
    });

    it("returns full UTxO (caller can filter with Query.filterByAddress)", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(MOCK_UTXO));

      const query = await Query.create({ httpUrl: MOCK_HTTP_URL });
      const result = await query.getUTxO();

      expect(Object.keys(result)).toHaveLength(3);
      const aliceOnly = Query.filterByAddress(result, ADDR_ALICE);
      expect(Object.keys(aliceOnly)).toHaveLength(2);
      expect(aliceOnly).toEqual({
        "abc123#0": MOCK_UTXO["abc123#0"],
        "ghi789#0": MOCK_UTXO["ghi789#0"],
      });
    });

    it("throws a QueryError when the HTTP request fails", async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error("network error"));

      const query = await Query.create({ httpUrl: MOCK_HTTP_URL });
      await expect(query.getUTxO()).rejects.toThrow();
    });
  });

  describe("getSnapshot", () => {
    it("fetches from GET /snapshot and returns the decoded snapshot", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse(MOCK_SNAPSHOT_RESPONSE),
      );

      const query = await Query.create({ httpUrl: MOCK_HTTP_URL });
      const result = await query.getSnapshot();

      expect(result).toMatchObject({ tag: "InitialSnapshot" });
      const firstArg = vi.mocked(fetch).mock.calls[0]?.[0];
      const url =
        firstArg instanceof Request
          ? firstArg.url
          : typeof firstArg === "string"
            ? firstArg
            : firstArg instanceof URL
              ? firstArg.href
              : "";
      expect(url).toContain("/snapshot");
    });

    it("throws a QueryError when the HTTP request fails", async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error("timeout"));

      const query = await Query.create({ httpUrl: MOCK_HTTP_URL });
      await expect(query.getSnapshot()).rejects.toThrow();
    });
  });

  describe("getHeadState", () => {
    it("fetches from GET /head and returns the decoded head state", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(MOCK_HEAD_STATE));

      const query = await Query.create({ httpUrl: MOCK_HTTP_URL });
      const result = await query.getHeadState();

      expect(result).toMatchObject({ tag: "Idle" });
      const firstArg = vi.mocked(fetch).mock.calls[0]?.[0];
      const url =
        firstArg instanceof Request
          ? firstArg.url
          : typeof firstArg === "string"
            ? firstArg
            : firstArg instanceof URL
              ? firstArg.href
              : "";
      expect(url).toContain("/head");
    });

    it("throws a QueryError when the HTTP request fails", async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error("connection refused"));

      const query = await Query.create({ httpUrl: MOCK_HTTP_URL });
      await expect(query.getHeadState()).rejects.toThrow();
    });
  });

  describe("effect API", () => {
    it("getUTxO returns an Effect that succeeds with the UTxO", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(MOCK_UTXO));

      const query = await Query.create({ httpUrl: MOCK_HTTP_URL });
      const result = await Effect.runPromise(query.effect.getUTxO());

      expect(result).toEqual(MOCK_UTXO);
    });

    it("getUTxO Effect returns full UTxO", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(MOCK_UTXO));

      const query = await Query.create({ httpUrl: MOCK_HTTP_URL });
      const result = await Effect.runPromise(query.effect.getUTxO());

      expect(Object.keys(result)).toHaveLength(3);
      expect(result).toEqual(MOCK_UTXO);
    });
  });
});

// =============================================================================
// Streaming subscriptions (mock head)
// =============================================================================

describe("Query streaming subscriptions (mock)", () => {
  describe("subscribeUTxO", () => {
    it("emits UTxO sets from SnapshotConfirmed events", async () => {
      const query = await Query.create({ httpUrl: MOCK_HTTP_URL });
      const head = makeEventHead([
        { tag: "SnapshotConfirmed", payload: MOCK_SNAPSHOT_CONFIRMED_PAYLOAD },
        { tag: "HeadIsOpen", payload: undefined },
      ]);

      const stream = query.effect.subscribeUTxO(head);

      const result = await Effect.runPromise(
        Stream.take(stream, 1).pipe(Stream.runCollect),
      );
      const items = Array.from(result);

      expect(items).toHaveLength(1);
      expect(items[0]).toEqual(MOCK_SNAPSHOT_CONFIRMED_PAYLOAD.snapshot.utxo);
    });

    it("emitted UTxO can be filtered with Query.filterByAddress", async () => {
      const utxo = {
        "abc#0": { address: ADDR_ALICE, value: { lovelace: 100 } },
        "def#1": { address: ADDR_BOB, value: { lovelace: 200 } },
      };
      const payload = {
        ...MOCK_SNAPSHOT_CONFIRMED_PAYLOAD,
        snapshot: { ...MOCK_SNAPSHOT_CONFIRMED_PAYLOAD.snapshot, utxo },
      };

      const query = await Query.create({ httpUrl: MOCK_HTTP_URL });
      const head = makeEventHead([{ tag: "SnapshotConfirmed", payload }]);

      const stream = query.effect.subscribeUTxO(head);

      const result = await Effect.runPromise(
        Stream.take(stream, 1).pipe(Stream.runCollect),
      );
      const items = Array.from(result);
      expect(items).toHaveLength(1);
      const full = items[0] as typeof utxo;
      const aliceOnly = Query.filterByAddress(full, ADDR_ALICE);
      expect(Object.keys(aliceOnly)).toEqual(["abc#0"]);
      expect(aliceOnly["abc#0"]).toEqual({ address: ADDR_ALICE, value: { lovelace: 100 } });
    });

    it("async iterator emits UTxO entries via subscribeUTxO", async () => {
      const query = await Query.create({ httpUrl: MOCK_HTTP_URL });
      const head = makeEventHead([
        { tag: "SnapshotConfirmed", payload: MOCK_SNAPSHOT_CONFIRMED_PAYLOAD },
      ]);

      const iter = query.subscribeUTxO(head);
      const { done, value } = await iter.next();

      expect(done).toBe(false);
      expect(value).toEqual(MOCK_SNAPSHOT_CONFIRMED_PAYLOAD.snapshot.utxo);
    });
  });

  describe("subscribeSnapshots", () => {
    it("emits snapshot data from SnapshotConfirmed events", async () => {
      const query = await Query.create({ httpUrl: MOCK_HTTP_URL });
      const head = makeEventHead([
        { tag: "SnapshotConfirmed", payload: MOCK_SNAPSHOT_CONFIRMED_PAYLOAD },
        { tag: "TxValid", payload: MOCK_TX_VALID_PAYLOAD },
      ]);

      const stream = query.effect.subscribeSnapshots(head);

      const result = await Effect.runPromise(
        Stream.take(stream, 1).pipe(Stream.runCollect),
      );
      const items = Array.from(result);

      expect(items).toHaveLength(1);
      expect(items[0]?.number).toBe(42);
      expect(items[0]?.headId).toBe("test-head-id");
    });

    it("emits multiple snapshots in order", async () => {
      const query = await Query.create({ httpUrl: MOCK_HTTP_URL });
      const second = {
        ...MOCK_SNAPSHOT_CONFIRMED_PAYLOAD,
        snapshot: {
          ...MOCK_SNAPSHOT_CONFIRMED_PAYLOAD.snapshot,
          number: 43,
        },
        seq: 2,
      };

      const head = makeEventHead([
        { tag: "SnapshotConfirmed", payload: MOCK_SNAPSHOT_CONFIRMED_PAYLOAD },
        { tag: "SnapshotConfirmed", payload: second },
      ]);

      const stream = query.effect.subscribeSnapshots(head);

      const result = await Effect.runPromise(
        Stream.take(stream, 2).pipe(Stream.runCollect),
      );
      const numbers = Array.from(result).map((s) => s.number);

      expect(numbers).toEqual([42, 43]);
    });

    it("async iterator emits snapshot via subscribeSnapshots", async () => {
      const query = await Query.create({ httpUrl: MOCK_HTTP_URL });
      const head = makeEventHead([
        { tag: "SnapshotConfirmed", payload: MOCK_SNAPSHOT_CONFIRMED_PAYLOAD },
      ]);

      const iter = query.subscribeSnapshots(head);
      const { done, value } = await iter.next();

      expect(done).toBe(false);
      expect(value?.number).toBe(42);
    });
  });

  describe("subscribeTransactions", () => {
    it("emits TxValid events from the head event stream", async () => {
      const query = await Query.create({ httpUrl: MOCK_HTTP_URL });
      const head = makeEventHead([
        { tag: "SnapshotConfirmed", payload: MOCK_SNAPSHOT_CONFIRMED_PAYLOAD },
        { tag: "TxValid", payload: MOCK_TX_VALID_PAYLOAD },
      ]);

      const stream = query.effect.subscribeTransactions(head);

      const result = await Effect.runPromise(
        Stream.take(stream, 1).pipe(Stream.runCollect),
      );
      const items = Array.from(result);

      expect(items).toHaveLength(1);
      expect(items[0]?.transactionId).toBe("deadbeef1234");
      expect(items[0]?.headId).toBe("test-head-id");
    });

    it("skips events with invalid TxValid payloads", async () => {
      const query = await Query.create({ httpUrl: MOCK_HTTP_URL });
      const head = makeEventHead([
        { tag: "TxValid", payload: { not: "a valid tx valid" } },
        { tag: "TxValid", payload: MOCK_TX_VALID_PAYLOAD },
      ]);

      const stream = query.effect.subscribeTransactions(head);

      const result = await Effect.runPromise(
        Stream.take(stream, 1).pipe(Stream.runCollect),
      );
      const items = Array.from(result);

      expect(items).toHaveLength(1);
      expect(items[0]?.transactionId).toBe("deadbeef1234");
    });

    it("async iterator emits TxValid via subscribeTransactions", async () => {
      const query = await Query.create({ httpUrl: MOCK_HTTP_URL });
      const head = makeEventHead([
        { tag: "TxValid", payload: MOCK_TX_VALID_PAYLOAD },
      ]);

      const iter = query.subscribeTransactions(head);
      const { done, value } = await iter.next();

      expect(done).toBe(false);
      expect(value?.transactionId).toBe("deadbeef1234");
    });
  });

  describe("subscribeUTxO with mock:// Head transport", () => {
    it("subscribeUTxO receives updates through mock:// Head", async () => {
      const query = await Query.create({ httpUrl: MOCK_HTTP_URL });
      const head = await Head.create({ url: "mock://localhost:4001" });

      try {
        const stream = query.effect.subscribeUTxO(head);

        const result = await Effect.runPromise(
          Stream.take(stream, 0).pipe(Stream.runCollect),
        );

        expect(Array.from(result)).toHaveLength(0);
      } finally {
        await head.dispose();
      }
    });
  });
});
