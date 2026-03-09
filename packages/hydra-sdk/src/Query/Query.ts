/**
 * This module defines the `HydraQuery` interface and related types for
 * querying Hydra node state over HTTP (UTxO, snapshot, head state) and
 * subscribing to head events (UTxO updates, snapshots, transactions).
 */
import {
  FetchHttpClient,
  HttpClient,
  HttpClientResponse,
} from "@effect/platform";
import {
  Data,
  Effect,
  Fiber,
  Option,
  Queue,
  Schema,
  Stream,
} from "effect";

import type { HydraHead } from "../Head/Head.js";
import type {
  HeadResponse,
  SnapshotConfirmedMessage,
  SnapshotResponse,
  TxValidMessage,
} from "../Protocol/ResponseMessage.js";
import {
  HeadResponseSchema,
  SnapshotConfirmedMessageSchema,
  SnapshotResponseSchema,
  TxValidMessageSchema,
} from "../Protocol/ResponseMessage.js";
import type { UTxO } from "../Protocol/Types.js";
import { UTxOSchema } from "../Protocol/Types.js";
import { withCause } from "./Query.http.js";

/**
 * Tagged error type for Query operations (HTTP fetch failures, decode errors, etc.).
 *
 * @category Errors
 */
export class QueryError extends Data.TaggedError("QueryError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Snapshot type extracted from SnapshotConfirmedMessage for convenience.
 *
 * @category Models
 */
export type Snapshot = SnapshotConfirmedMessage["snapshot"];

/**
 * Configuration for creating a `HydraQuery`. Extensible for future options
 * (e.g. timeoutMs, fetch options).
 *
 * @category Models
 */
export interface QueryConfig {
  /** Base URL of the Hydra node's HTTP API (e.g. "http://localhost:4001"). */
  readonly httpUrl: string;
}

/**
 * Primary interface for querying Hydra node state (HTTP) and subscribing to
 * head events (WebSocket). Provides Promise and Effect APIs.
 *
 * @category Models
 */
export interface HydraQuery {
  /* Queries the current UTxO set from the Hydra node's HTTP API. */
  getUTxO(): Promise<UTxO>;

  /* Queries the current snapshot from the Hydra node's HTTP API. */
  getSnapshot(): Promise<SnapshotResponse>;

  /* Queries the current head state from the Hydra node's HTTP API. */
  getHeadState(): Promise<HeadResponse>;

  /* Subscribes to head events and emits UTxO snapshots from SnapshotConfirmed messages. */
  subscribeUTxO(head: HydraHead): AsyncIterableIterator<UTxO | string>;

  /* Subscribes to head events and emits snapshots from SnapshotConfirmed messages. */
  subscribeSnapshots(head: HydraHead): AsyncIterableIterator<Snapshot>;

  /* Subscribes to head events and emits valid transactions from TxValid messages. */
  subscribeTransactions(head: HydraHead): AsyncIterableIterator<TxValidMessage>;

  /* Effect-based API for the same operations, allowing composition with other effects. */
  readonly effect: {
    getUTxO(): Effect.Effect<UTxO, QueryError>;

    getSnapshot(): Effect.Effect<SnapshotResponse, QueryError>;

    getHeadState(): Effect.Effect<HeadResponse, QueryError>;

    subscribeUTxO(head: HydraHead): Stream.Stream<UTxO | string>;

    subscribeSnapshots(head: HydraHead): Stream.Stream<Snapshot>;

    subscribeTransactions(head: HydraHead): Stream.Stream<TxValidMessage>;
  };
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

/**
 * Filters a UTxO set to include only entries matching the specified address.
 *
 * @param utxo - the full UTxO set to filter
 * @param address - the address to filter by
 * @returns a new UTxO object containing only entries with the specified address
 *
 * @category Utils
 */
export const filterByAddress = (utxo: UTxO, address: string): UTxO => {
  const result: Record<string, UTxO[string]> = {};
  for (const [key, txOut] of Object.entries(utxo)) {
    if (txOut.address === address) {
      result[key] = txOut;
    }
  }
  return result;
};

// ---------------------------------------------------------------------------
// Effect fetches (HTTP)
// ---------------------------------------------------------------------------

/**
 * Fetches the current UTxO set from the Hydra node's HTTP API.
 *
 * @param httpUrl - base URL of the Hydra node's HTTP API (e.g. "http://localhost:4001")
 * @returns an Effect that, when run, will fetch and decode the UTxO set, or fail with a QueryError
 */
export const fetchUTxO = (
  config: QueryConfig,
): Effect.Effect<UTxO, QueryError, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const response = yield* client.get(`${config.httpUrl}/snapshot/utxo`).pipe(
      Effect.mapError(
        (cause) =>
          new QueryError({
            message: withCause("Failed to fetch UTxO", cause),
            cause,
          }),
      ),
    );
    return yield* HttpClientResponse.schemaBodyJson(UTxOSchema)(response).pipe(
      Effect.mapError(
        (cause) =>
          new QueryError({
            message: withCause("Failed to decode UTxO response", cause),
            cause,
          }),
      ),
    );
  });

/**
 * Fetches the current snapshot from the Hydra node's HTTP API.
 *
 * @param config - configuration object containing the base URL of the Hydra node's HTTP API
 */
export const fetchSnapshot = (
  config: QueryConfig,
): Effect.Effect<SnapshotResponse, QueryError, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const response = yield* client.get(`${config.httpUrl}/snapshot`).pipe(
      Effect.mapError(
        (cause) =>
          new QueryError({
            message: withCause("Failed to fetch snapshot", cause),
            cause,
          }),
      ),
    );
    return yield* HttpClientResponse.schemaBodyJson(SnapshotResponseSchema)(
      response,
    ).pipe(
      Effect.mapError(
        (cause) =>
          new QueryError({
            message: withCause("Failed to decode snapshot response", cause),
            cause,
          }),
      ),
    );
  });

/**
 * Fetches the current head state from the Hydra node's HTTP API.
 *
 * @param config - configuration object containing the base URL of the Hydra node's HTTP API
 */
export const fetchHeadState = (
  config: QueryConfig,
): Effect.Effect<HeadResponse, QueryError, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const response = yield* client.get(`${config.httpUrl}/head`).pipe(
      Effect.mapError(
        (cause) =>
          new QueryError({
            message: withCause("Failed to fetch head state", cause),
            cause,
          }),
      ),
    );
    return yield* HttpClientResponse.schemaBodyJson(HeadResponseSchema)(
      response,
    ).pipe(
      Effect.mapError((cause) => {
        const detail =
          cause && typeof (cause as { message?: string }).message === "string"
            ? (cause as { message: string }).message
            : cause && Array.isArray((cause as unknown as { errors?: unknown }).errors)
              ? JSON.stringify((cause as unknown as { errors: unknown }).errors)
              : String(cause);
        return new QueryError({
          message: `Failed to decode head state response: ${detail}`,
          cause,
        });
      }),
    );
  });

// ---------------------------------------------------------------------------
// Subscription streams (head events)
// ---------------------------------------------------------------------------

const debugSubscription =
  typeof process !== "undefined" &&
  (process.env.DEBUG?.includes("Query") ?? process.env.HYDRA_HTTP_URL);

/*
* Subscribes to head events and emits UTxO snapshots from SnapshotConfirmed messages.
* 
* @param head - the HydraHead to subscribe to for events
* @returns a Stream that emits UTxO snapshots extracted from SnapshotConfirmed messages, or raw payloads if decoding fails (when debugSubscription is enabled)
*
* @category Subscriptions
*/
const subscribeUTxOStream = (head: HydraHead): Stream.Stream<UTxO | string> =>
  head.effect.events().pipe(
    Stream.filter((output) => output.tag === "SnapshotConfirmed"),
    Stream.mapEffect((output) =>
      Schema.decodeUnknown(SnapshotConfirmedMessageSchema)(output.payload).pipe(
        Effect.option,
        Effect.map((opt): Option.Option<UTxO | string> =>
          Option.match(opt, {
            onNone: () => {
              if (!debugSubscription) return Option.none();
              const raw =
                typeof output.payload === "string"
                  ? output.payload
                  : JSON.stringify(output.payload ?? {});
              return Option.some(raw);
            },
            onSome: (msg) => {
              const utxo = msg.snapshot.utxo;
              return Option.some(utxo);
            },
          }),
        ),
      ),
    ),
    Stream.filterMap((opt) => opt),
  );

/*
* Subscribes to head events and emits snapshots from SnapshotConfirmed messages.
* 
* @param head - the HydraHead to subscribe to for events
* @returns a Stream that emits snapshots extracted from SnapshotConfirmed messages, or raw payloads if decoding fails (when debugSubscription is enabled)
*
* @category Subscriptions
*/
const subscribeSnapshotsStream = (
  head: HydraHead,
): Stream.Stream<Snapshot> =>
  head.effect.events().pipe(
    Stream.filter((output) => output.tag === "SnapshotConfirmed"),
    Stream.mapEffect((output) =>
      Schema.decodeUnknown(SnapshotConfirmedMessageSchema)(output.payload).pipe(
        Effect.option,
      ),
    ),
    Stream.filterMap((opt) => Option.map(opt, (msg) => msg.snapshot)),
  );

/*
* Subscribes to head events and emits valid transactions from TxValid messages.
* 
* @param head - the HydraHead to subscribe to for events
* @returns a Stream that emits TxValidMessage objects decoded from TxValid messages, or skips if decoding fails (when debugSubscription is enabled)
*
* @category Subscriptions
*/
const subscribeTransactionsStream = (
  head: HydraHead,
): Stream.Stream<TxValidMessage> =>
  head.effect.events().pipe(
    Stream.filter((output) => output.tag === "TxValid"),
    Stream.mapEffect((output) =>
      Schema.decodeUnknown(TxValidMessageSchema)(output.payload).pipe(
        Effect.option,
      ),
    ),
    Stream.filterMap((opt) => opt),
  );

/* Utility to convert a Stream into an AsyncIterableIterator, allowing use with for-await-of loops */
const streamToAsyncIterator = async function* <A>(
  stream: Stream.Stream<A>,
): AsyncIterableIterator<A> {
  const queue = Effect.runSync(Queue.unbounded<Option.Option<A>>());

  const fiber = Effect.runFork(
    Stream.runForEach(stream, (item) =>
      Queue.offer(queue, Option.some(item)),
    ).pipe(
      Effect.ensuring(Queue.offer(queue, Option.none())),
      Effect.orDie,
    ),
  );

  try {
    while (true) {
      const opt = await Effect.runPromise(Queue.take(queue));
      if (Option.isNone(opt)) return;
      yield opt.value;
    }
  } finally {
    await Effect.runPromise(Fiber.interrupt(fiber));
    await Effect.runPromise(Queue.shutdown(queue).pipe(Effect.orDie));
  }
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const createImpl = (config: QueryConfig): HydraQuery => {
  const getUTxOEffect = (address?: string): Effect.Effect<UTxO, QueryError> =>
    fetchUTxO(config).pipe(
      Effect.map((utxo) => (address ? filterByAddress(utxo, address) : utxo)),
      Effect.provide(FetchHttpClient.layer),
    );

  const getSnapshotEffect = (): Effect.Effect<SnapshotResponse, QueryError> =>
    fetchSnapshot(config).pipe(Effect.provide(FetchHttpClient.layer));

  const getHeadStateEffect = (): Effect.Effect<HeadResponse, QueryError> =>
    fetchHeadState(config).pipe(Effect.provide(FetchHttpClient.layer));

  const effectApi = {
    getUTxO: () => getUTxOEffect(),
    getSnapshot: getSnapshotEffect,
    getHeadState: getHeadStateEffect,
    subscribeUTxO: subscribeUTxOStream,
    subscribeSnapshots: subscribeSnapshotsStream,
    subscribeTransactions: subscribeTransactionsStream,
  };

  const runEffect = <A>(op: Effect.Effect<A, QueryError>): Promise<A> =>
    Effect.runPromise(op);

  return {
    getUTxO: () => runEffect(effectApi.getUTxO()),
    getSnapshot: () => runEffect(effectApi.getSnapshot()),
    getHeadState: () => runEffect(effectApi.getHeadState()),
    subscribeUTxO: (head: HydraHead) =>
      streamToAsyncIterator(subscribeUTxOStream(head)),
    subscribeSnapshots: (head: HydraHead) =>
      streamToAsyncIterator(subscribeSnapshotsStream(head)),
    subscribeTransactions: (head: HydraHead) =>
      streamToAsyncIterator(subscribeTransactionsStream(head)),
    effect: effectApi,
  };
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const effect = {
  /**
   * Creates a `HydraQuery` as an `Effect` from the given config. No environment
   * requirement; config is passed in.
   */
  create: (config: QueryConfig): Effect.Effect<HydraQuery, QueryError> =>
    Effect.succeed(createImpl(config)),
};

/**
 * Creates a `HydraQuery` from the given config and returns it as a `Promise`.
 *
 * @category Constructors
 *
 * @param config - Query config (e.g. `{ httpUrl: "http://localhost:4001" }`).
 * @returns A `Promise` that resolves to a `HydraQuery` instance.
 */
export const create = (config: QueryConfig): Promise<HydraQuery> =>
  Effect.runPromise(effect.create(config));
