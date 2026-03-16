/**
 * This module defines the `HydraHead` interface and related types for managing
 * the lifecycle of a Hydra Head, including connection to hydra-node, command
 * routing, and state management.
 */
import {
  Context,
  Data,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Layer,
  PubSub,
  Queue,
  Ref,
  Scope,
  Stream,
} from "effect";

import type { UTxO } from "../Protocol/Types.js";
import { postCommit } from "../Provider/http.js";
import { makeHeadFsm, outputTagFromStatus } from "./Head.fsm.js";
import type { MatchResult } from "./Head.router.js";
import {
  makeCommandRouter,
  matchContinue,
  matchFailure,
  matchSuccess,
} from "./Head.router.js";
import { isServerOutput, makeHeadTransport } from "./Head.transport.js";

/** Derive an HTTP URL from a WebSocket URL. */
const wsToHttp = (wsUrl: string): string =>
  wsUrl.replace(/^ws(s?):\/\//, "http$1://");

/**
 * All possible lifecycle states of a Hydra Head.
 *
 * Transitions are driven exclusively by server-side events emitted by
 * hydra-node over the WebSocket connection. The normal happy-path is:
 * `Idle → Initializing → Open → Closed → FanoutPossible → Final`.
 *
 * @category Models
 */
export type HeadStatus =
  | "Idle"
  | "Initializing"
  | "Open"
  | "Closed"
  | "FanoutPossible"
  | "Final"
  | "Aborted";

/**
 * Connection and reconnection configuration for a Hydra Head.
 *
 * @category Models
 */
export interface HeadConfig {
  /** WebSocket URL of the hydra-node API (e.g. `"ws://localhost:9944"`). */
  readonly url: string;
  /**
   * HTTP URL of the hydra-node REST API (e.g. `"http://localhost:9944"`).
   * If omitted, derived automatically from `url` by replacing `ws(s)://`
   * with `http(s)://`.
   */
  readonly httpUrl?: string;
  /**
   * When `true`, the hydra-node will replay all past server outputs upon the
   * initial WebSocket connection so the client can reconstruct current state.
   */
  readonly historyOnConnect?: boolean;
  /**
   * When `true`, the hydra-node replays past server outputs after each
   * automatic reconnection attempt.
   */
  readonly historyOnReconnect?: boolean;
  /** Optional exponential back-off parameters for automatic reconnection. */
  readonly reconnect?: {
    /** Optional maximum number of reconnection attempts before giving up. */
    readonly maxRetries?: number;
    /** Optional delay in milliseconds before the first reconnection attempt. */
    readonly initialDelayMs?: number;
    /** Optional upper bound in milliseconds for the back-off delay. */
    readonly maxDelayMs?: number;
    /** Optional multiplier applied to the delay after each failed attempt. */
    readonly factor?: number;
    /** Optional random jitter factor in the range `[0, 1]` (inclusive) added to each delay to avoid thundering herd. The SDK does not perform runtime validation of this range and forwards the value to the underlying reconnection implementation; callers are responsible for only providing values within the documented range. */
    readonly jitter?: number;
  };
  /**
   * Optional heartbeat configuration for detecting stale connections.
   * When enabled, the SDK monitors incoming message activity and forces
   * a reconnection if no messages are received within the timeout window.
   */
  readonly heartbeat?: {
    /** Interval in milliseconds between heartbeat checks. Default: 30000 (30s). */
    readonly intervalMs?: number;
    /** Timeout in milliseconds after the last received message before the connection is considered stale. Default: 10000 (10s). */
    readonly timeoutMs?: number;
  };
}

/**
 * Parameters for the `Init` command that opens a new Hydra Head on the L1
 * chain.
 *
 * @category Models
 */
export interface InitParams {
  /** Optional contestation period in seconds; if provided, overrides the default configured in hydra-node. */
  readonly contestationPeriod?: number;
}

/**
 * Request body for the Hydra Head REST `/commit` endpoint.
 *
 * Pass an empty object `{}` for an empty commit, or provide a blueprint
 * transaction together with the UTxO set to commit into the head.
 *
 * @category Models
 */
export interface CommitRequest {
  /** Blueprint transaction that references the UTxOs to commit. */
  readonly blueprintTx?: {
    readonly type: string;
    readonly description: string;
    readonly cborHex: string;
  };
  /** UTxO map (keyed by `"txHash#index"`) to commit into the head. */
  readonly utxo?: UTxO;
}

/**
 * A raw event envelope emitted by hydra-node over the WebSocket connection.
 *
 * @category Models
 */
export interface ServerOutput {
  /** Discriminating tag that identifies the hydra-node event type. */
  readonly tag: string;
  /** Optional event-specific payload; shape varies by `tag`. */
  readonly payload?: unknown;
}

/**
 * Discriminated union of all command tags a client can send to hydra-node.
 * Most are WebSocket commands; `Commit` is routed through the REST API.
 *
 * @category Models
 */
export type ClientInputTag =
  | "Init"
  | "Commit"
  | "NewTx"
  | "Close"
  | "SafeClose"
  | "Fanout"
  | "Abort"
  | "Recover"
  | "Decommit"
  | "Contest";

/**
 * Failure envelope returned by hydra-node when a client command is rejected.
 *
 * @category Models
 */
export interface ClientMessage {
  /** Discriminating tag that identifies which command failed. */
  readonly tag: "CommandFailed" | "PostTxOnChainFailed";
  /** Optional tag of the client command that triggered this failure, if applicable. */
  readonly clientInputTag?: ClientInputTag;
  /** Optional human-readable explanation of why the command failed. */
  readonly reason?: string;
}

/**
 * Initial greeting payload sent by hydra-node on every (re)connection,
 * carrying the current head state so the client can sync without replaying
 * history.
 *
 * @category Models
 */
export interface Greetings {
  /** The head state as known by hydra-node at the time of the greeting. */
  readonly headStatus: HeadStatus;
  /** The head ID, present when the head has been initialized. */
  readonly headId?: string;
}

/**
 * Rejection payload emitted when hydra-node cannot parse or route a client
 * message.
 *
 * @category Models
 */
export interface InvalidInput {
  /** Human-readable explanation of why the input was rejected. */
  readonly reason: string;
  /** The raw input string that was rejected, if available. */
  readonly input?: string;
}

/**
 * Discriminated union of every event type that can arrive from hydra-node or
 * be generated internally by the SDK transport layer.
 *
 * @category Models
 */
export type ApiEvent =
  | { readonly _tag: "ServerOutput"; readonly output: ServerOutput }
  | { readonly _tag: "ClientMessage"; readonly message: ClientMessage }
  | { readonly _tag: "Greetings"; readonly greetings: Greetings }
  | { readonly _tag: "InvalidInput"; readonly invalidInput: InvalidInput }
  | {
      readonly _tag: "ConnectionRestored";
      readonly connectionRestored: {
        readonly previousStatus: HeadStatus;
        readonly restoredStatus: HeadStatus;
      };
    };

/**
 * Function type returned by `HydraHead.subscribe` to cancel the subscription.
 *
 * @category Models
 */
export type Unsubscribe = () => void;

/**
 * Tagged error type representing any failure that can occur during Hydra Head operations,
 * such as command rejections, timeouts, transport errors, or protocol violations.
 *
 * @category Errors
 */
export class HeadError extends Data.TaggedError("HeadError")<{
  /** Human-readable description of what went wrong. */
  readonly message: string;
  /** Optional underlying cause (transport error, protocol violation, etc.). */
  readonly cause?: unknown;
  /** Optional structured failure details from the Hydra node response. */
  readonly details?: {
    /** The failure event tag (e.g. "CommandFailed", "TxInvalid", "PostTxOnChainFailed"). */
    readonly tag?: string;
    /** The command that triggered the failure. */
    readonly command?: string;
    /** Transaction ID associated with the failure, when applicable. */
    readonly txId?: string;
    /** Validation error details from the Hydra node. */
    readonly validationError?: unknown;
  };
}> {}

/**
 * Primary interface representing a Hydra Head instance. Provides methods to execute
 * protocol commands, subscribe to server events, and manage the head lifecycle.
 *
 * @category Models
 *
 * @example
 * ```ts
 * // Promise API — full lifecycle
 * import { Head } from "@no-witness-labs/hydra-sdk";
 *
 * async function example() {
 *   const head = await Head.create({ url: "ws://localhost:4001" });
 *
 *   await head.init();
 *   await head.commit({}); // or { blueprintTx: { ... }, utxo: { ... } }
 *   await head.close();
 *   await head.fanout();
 *   console.log(head.getState()); // "Final"
 *
 *   await head.dispose();
 * }
 * ```
 *
 * @example
 * ```ts
 * // Effect API — full lifecycle
 * import { Effect } from "effect";
 * import { Head } from "@no-witness-labs/hydra-sdk";
 *
 * const program = Effect.gen(function* () {
 *   const head = yield* Head.effect.create({ url: "ws://localhost:4001" });
 *
 *   yield* head.effect.init();
 *   yield* head.effect.commit({}); // or { blueprintTx: { ... }, utxo: { ... } }
 *   yield* head.effect.close();
 *   yield* head.effect.fanout();
 *   console.log(head.getState()); // "Final"
 *
 *   yield* head.effect.dispose();
 * });
 * ```
 */
export interface HydraHead {
  /**
   * Current `HeadStatus` of this head, read synchronously from the
   * in-memory FSM state.
   */
  readonly state: HeadStatus;

  /**
   * Unique identifier for the Hydra Head.
   *
   * Set to a placeholder value after `init()` is acknowledged and reset to
   * `null` after `dispose()`. Full extraction from the `HeadIsInitializing`
   * payload is pending protocol-schema integration.
   */
  readonly headId: string | null;

  /**
   * Returns the current `HeadStatus` synchronously.
   *
   * Equivalent to reading the `state` property; provided as a method for
   * contexts that require a callable.
   *
   * @example Promise API
   * ```ts
   * import { Head } from "@no-witness-labs/hydra-sdk";
   *
   * const head = await Head.create({ url: "ws://localhost:9944" });
   * console.log(head.getState()); // "Idle"
   * ```
   *
   * @example Effect API
   * ```ts
   * import { Effect } from "effect";
   * import { Head } from "@no-witness-labs/hydra-sdk";
   *
   * const program = Effect.gen(function* () {
   *   const head = yield* Head.effect.create({ url: "ws://localhost:9944" });
   *   // getState() is synchronous in both APIs
   *   console.log(head.getState()); // "Idle"
   * });
   * ```
   */
  getState(): HeadStatus;

  /**
   * Initialize a new Hydra Head on the L1 chain.
   *
   * Sends the `Init` command over the WebSocket and resolves once the
   * hydra-node confirms `HeadIsInitializing`.
   *
   * @example Promise API
   * ```ts
   * const head = await Head.create({ url: "ws://localhost:4001" });
   * await head.init();
   * console.log(head.getState()); // "Initializing"
   * ```
   *
   * @example Effect API
   * ```ts
   * const program = Effect.gen(function* () {
   *   const head = yield* Head.effect.create({ url: "ws://localhost:4001" });
   *   yield* head.effect.init();
   * });
   * ```
   */
  init(params?: InitParams): Promise<void>;

  /**
   * Commits UTxOs into the Hydra Head via the REST `/commit` endpoint.
   *
   * POSTs the commit body (blueprint transaction + UTxO map) to the
   * hydra-node HTTP API. The returned draft transaction must be signed
   * and submitted to L1 by the caller. Resolves once `HeadIsOpen` is
   * received over WebSocket, indicating all participants have committed.
   *
   * @param body - Commit request body containing `blueprintTx` and `utxo`,
   *   or an empty object `{}` for an empty commit.
   *
   * @example Promise API
   * ```ts
   * import { Head } from "@no-witness-labs/hydra-sdk";
   *
   * const head = await Head.create({ url: "ws://localhost:9944" });
   * await head.init();
   * const draftTx = await head.commit({ blueprintTx: { ... }, utxo: { ... } });
   * // sign and submit draftTx to L1
   * ```
   *
   * @example Effect API
   * ```ts
   * import { Effect } from "effect";
   * import { Head } from "@no-witness-labs/hydra-sdk";
   *
   * const program = Effect.gen(function* () {
   *   const head = yield* Head.effect.create({ url: "ws://localhost:9944" });
   *   yield* head.effect.init();
   *   const draftTx = yield* head.effect.commit({ blueprintTx: { ... }, utxo: { ... } });
   * });
   * ```
   */
  commit(body: CommitRequest): Promise<unknown>;

  /**
   * Sends the `Close` command to request closing the Hydra Head on-chain.
   *
   * Resolves once the `HeadIsClosed` server output is received. After this
   * point, the contestation period begins and `fanout` becomes
   * available once it expires.
   *
   * @example Promise API
   * ```ts
   * import { Head } from "@no-witness-labs/hydra-sdk";
   *
   * const head = await Head.create({ url: "ws://localhost:9944" });
   * // ... perform off-chain transactions ...
   * await head.close();
   * console.log(head.getState()); // "Closed"
   * ```
   *
   * @example Effect API
   * ```ts
   * import { Effect } from "effect";
   * import { Head } from "@no-witness-labs/hydra-sdk";
   *
   * const program = Effect.gen(function* () {
   *   const head = yield* Head.effect.create({ url: "ws://localhost:9944" });
   *   yield* head.effect.close();
   * });
   * ```
   */
  close(): Promise<void>;

  /**
   * Sends the `SafeClose` command to request closing the Hydra Head on-chain.
   *
   * Resolves once the `HeadIsClosed` server output is received, similar to
   * {@link close}. This is intended as a higher-level, "safer" close
   * operation, but currently behaves like `close` from the perspective of
   * lifecycle events.
   *
   * > **Note:** `SafeClose` is scaffold-only and not part of the hydra-node
   * > WebSocket protocol today. Any future behavior where it waits for
   * > `FanoutPossible` before initiating a close is not yet implemented.
   *
   * @example Promise API
   * ```ts
   * import { Head } from "@no-witness-labs/hydra-sdk";
   *
   * const head = await Head.create({ url: "ws://localhost:9944" });
   * await head.safeClose(); // sends SafeClose and waits for HeadIsClosed
   * ```
   *
   * @example Effect API
   * ```ts
   * import { Effect } from "effect";
   * import { Head } from "@no-witness-labs/hydra-sdk";
   *
   * const program = Effect.gen(function* () {
   *   const head = yield* Head.effect.create({ url: "ws://localhost:9944" });
   *   yield* head.effect.safeClose();
   * });
   * ```
   */
  safeClose(): Promise<void>;

  /**
   * Fans out the final UTxO set to the L1 chain after the contestation period
   * expires.
   *
   * Internally calls `HydraHead.effect.awaitReadyToFanout` to wait for
   * the `ReadyToFanout` event before sending the `Fanout` command. Resolves
   * once `HeadIsFinalized` is received.
   *
   * @example Promise API
   * ```ts
   * import { Head } from "@no-witness-labs/hydra-sdk";
   *
   * const head = await Head.create({ url: "ws://localhost:9944" });
   * await head.close();
   * await head.fanout(); // waits for ReadyToFanout then fans out
   * console.log(head.getState()); // "Final"
   * ```
   *
   * @example Effect API
   * ```ts
   * import { Effect } from "effect";
   * import { Head } from "@no-witness-labs/hydra-sdk";
   *
   * const program = Effect.gen(function* () {
   *   const head = yield* Head.effect.create({ url: "ws://localhost:9944" });
   *   yield* head.effect.close();
   *   yield* head.effect.fanout();
   * });
   * ```
   */
  fanout(): Promise<void>;

  /**
   * Aborts the head initialization before it is finalized on-chain. Sends the
   * `Abort` command and resolves once `HeadIsAborted` is received, returning the
   * head to the `Aborted` state.
   *
   * @example Promise API
   * ```ts
   * import { Head } from "@no-witness-labs/hydra-sdk";
   *
   * const head = await Head.create({ url: "ws://localhost:9944" });
   * await head.init();
   * await head.abort(); // cancel before any funds are committed
   * console.log(head.getState()); // "Aborted"
   * ```
   *
   * @example Effect API
   * ```ts
   * import { Effect } from "effect";
   * import { Head } from "@no-witness-labs/hydra-sdk";
   *
   * const program = Effect.gen(function* () {
   *   const head = yield* Head.effect.create({ url: "ws://localhost:9944" });
   *   yield* head.effect.init();
   *   yield* head.effect.abort();
   * });
   * ```
   */
  abort(): Promise<void>;

  /**
   * Submits a new transaction to the open Hydra Head. Sends `NewTx` via
   * WebSocket and resolves once `TxValid` is received for this transaction.
   *
   * @param transaction - The Cardano transaction in hydra-node envelope format.
   *
   * @example Promise API
   * ```ts
   * await head.newTx({
   *   type: "Tx ConwayEra",
   *   description: "Ledger Cddl Format",
   *   cborHex: "84a400...",
   *   txId: "abc123...",
   * });
   * ```
   */
  newTx(transaction: {
    type: string;
    description: string;
    cborHex: string;
    txId: string;
  }): Promise<void>;

  /**
   * Recovers a failed incremental commit deposit by transaction ID.
   *
   * Sends the `Recover` command and resolves once `CommitRecovered` is
   * received for the specified transaction.
   *
   * @param recoverTxId - The transaction ID of the deposit to recover.
   */
  recover(recoverTxId: string): Promise<void>;

  /**
   * Requests a decommit of UTxOs from the open Hydra Head back to L1.
   *
   * Sends the `Decommit` command and resolves once `DecommitApproved` is
   * received. Fails if the decommit is invalid.
   *
   * @param decommitTx - The decommit transaction in hydra-node envelope format.
   */
  decommit(decommitTx: {
    type: string;
    description: string;
    cborHex: string;
    txId: string;
  }): Promise<void>;

  /**
   * Contests the closure of the Hydra Head with a more recent snapshot.
   *
   * Sends the `Contest` command and resolves once `HeadIsContested` is
   * received. Only allowed when the head is in `Closed` state.
   */
  contest(): Promise<void>;

  /**
   * Fire-and-forget: validate the FSM guard and send a command without
   * waiting for a response. Useful in CLI / scripting contexts where
   * the caller checks status separately.
   */
  send(command: ClientInputTag, payload?: unknown): Promise<void>;

  /**
   * Registers a callback that is invoked for every `ServerOutput` event
   * published by the head.
   *
   * Returns an `Unsubscribe` function. The subscription is backed by an
   * internal PubSub with a sliding strategy (capacity 256), so slow consumers
   * may miss events if they fall behind.
   *
   * @param callback - Function called with each incoming `ServerOutput`.
   * @returns A function that cancels the subscription when called.
   *
   * @example
   * ```ts
   * import { Head } from "@no-witness-labs/hydra-sdk";
   *
   * const head = await Head.create({ url: "ws://localhost:9944" });
   *
   * const unsubscribe = head.subscribe((output) => {
   *   console.log("event:", output.tag, output.payload);
   * });
   *
   * await head.init();
   *
   * // Stop listening when done
   * unsubscribe();
   * await head.dispose();
   * ```
   */
  subscribe(callback: (event: ServerOutput) => void): Unsubscribe;

  /**
   * Returns an async iterator that yields each `ServerOutput` event in
   * arrival order.
   *
   * The iterator holds a PubSub subscription open until the loop exits or
   * the iterator is abandoned (via `return()` / garbage collection with
   * `finally` cleanup).
   *
   * @example
   * ```ts
   * import { Head } from "@no-witness-labs/hydra-sdk";
   *
   * const head = await Head.create({ url: "ws://localhost:9944" });
   *
   * // Consume events until the head is finalized
   * for await (const output of head.subscribeEvents()) {
   *   console.log("event:", output.tag);
   *   if (output.tag === "HeadIsFinalized") break;
   * }
   *
   * await head.dispose();
   * ```
   */
  subscribeEvents(): AsyncIterableIterator<ServerOutput>;

  /**
   * Tears down the head instance: interrupts the projector fiber, shuts down
   * the internal queues and PubSub hub, and closes the WebSocket transport.
   *
   * Calling `dispose` more than once is safe (idempotent). After disposal,
   * all further operations will reject with a `HeadError`.
   *
   * @example Promise API
   * ```ts
   * import { Head } from "@no-witness-labs/hydra-sdk";
   *
   * const head = await Head.create({ url: "ws://localhost:9944" });
   * await head.init();
   * // ... do work ...
   * await head.dispose();
   * ```
   *
   * @example Effect API
   * ```ts
   * import { Effect } from "effect";
   * import { Head } from "@no-witness-labs/hydra-sdk";
   *
   * const program = Effect.gen(function* () {
   *   const head = yield* Head.effect.create({ url: "ws://localhost:9944" });
   *   yield* head.effect.init();
   *   yield* head.effect.dispose();
   * });
   * ```
   */
  dispose(): Promise<void>;

  /**
   * Effect-native counterparts of every Promise API method, plus additional
   * Effect-only operations (`events`, `awaitReadyToFanout`).
   *
   * All methods return `Effect.Effect<void, HeadError>` unless noted
   * otherwise, making them composable with the full Effect ecosystem.
   */
  readonly effect: {
    init(params?: InitParams): Effect.Effect<void, HeadError>;
    commit(body: CommitRequest): Effect.Effect<unknown, HeadError>;
    close(): Effect.Effect<void, HeadError>;
    safeClose(): Effect.Effect<void, HeadError>;
    fanout(): Effect.Effect<void, HeadError>;
    /**
     * Waits for the head to reach the `FanoutPossible` state:
     * - Returns immediately if the head is already in `FanoutPossible`.
     * - Suspends until the `ReadyToFanout` event is received otherwise.
     * - Fails immediately if the head is already `Final`.
     *
     * Call this before `fanout` when you need explicit control over the
     * waiting step.
     *
     * @example
     * ```ts
     * import { Effect } from "effect";
     * import { Head } from "@no-witness-labs/hydra-sdk";
     *
     * const program = Effect.gen(function* () {
     *   const head = yield* Head.effect.create({ url: "ws://localhost:9944" });
     *   yield* head.effect.close();
     *   yield* head.effect.awaitReadyToFanout(); // suspends until contestation ends
     *   yield* head.effect.fanout();
     * });
     * ```
     */
    awaitReadyToFanout(): Effect.Effect<void, HeadError>;
    abort(): Effect.Effect<void, HeadError>;
    newTx(transaction: {
      type: string;
      description: string;
      cborHex: string;
      txId: string;
    }): Effect.Effect<void, HeadError>;
    recover(recoverTxId: string): Effect.Effect<void, HeadError>;
    decommit(decommitTx: {
      type: string;
      description: string;
      cborHex: string;
      txId: string;
    }): Effect.Effect<void, HeadError>;
    contest(): Effect.Effect<void, HeadError>;
    /**
     * Fire-and-forget: validate the FSM guard and send a command without
     * waiting for a response. Useful in CLI / scripting contexts where
     * the caller checks status separately.
     */
    send(
      command: ClientInputTag,
      payload?: unknown,
    ): Effect.Effect<void, HeadError>;
    events(): Stream.Stream<ServerOutput>;
    dispose(): Effect.Effect<void, HeadError>;
  };
}

// ---------------------------------------------------------------------------
// Command matching helpers
// ---------------------------------------------------------------------------

/** @internal Exported for testing only. */
export const isCommandFailure = (
  event: ApiEvent,
  command: ClientInputTag,
): MatchResult<never> => {
  if (event._tag === "InvalidInput") {
    return matchFailure(
      new HeadError({
        message: `Invalid input: ${event.invalidInput.reason}`,
        details: {
          tag: "InvalidInput",
          command,
          validationError: event.invalidInput.reason,
        },
      }),
    );
  }

  if (
    event._tag === "ClientMessage" &&
    event.message.clientInputTag === command
  ) {
    return matchFailure(
      new HeadError({
        message:
          event.message.reason ??
          `Command ${command} failed with ${event.message.tag}`,
        details: {
          tag: event.message.tag,
          command,
        },
      }),
    );
  }

  return matchContinue();
};

/** @internal Exported for testing only. */
export const matchServerTag = (
  event: ApiEvent,
  successTag: string,
  command: ClientInputTag,
): MatchResult<void> => {
  if (event._tag === "ServerOutput" && event.output.tag === successTag) {
    return matchSuccess(undefined);
  }

  return isCommandFailure(event, command);
};

/** @internal Exported for testing only. */
export const matchCommit = (event: ApiEvent): MatchResult<void> => {
  if (event._tag === "ServerOutput" && event.output.tag === "HeadIsOpen") {
    return matchSuccess(undefined);
  }
  if (event._tag === "ServerOutput" && event.output.tag === "DepositExpired") {
    const payload = event.output.payload as
      | { depositTxId?: string }
      | undefined;
    return matchFailure(
      new HeadError({
        message: `Deposit expired for commit transaction ${payload?.depositTxId ?? "unknown"}`,
        details: {
          tag: "DepositExpired",
          command: "Commit",
          txId: payload?.depositTxId,
        },
      }),
    );
  }
  return isCommandFailure(event, "Commit");
};

// ---------------------------------------------------------------------------
// Core factory
// ---------------------------------------------------------------------------

/**
 * Creates a new `HydraHead` instance based on the provided configuration.
 *
 * @param config configuration for the head, including WebSocket URL and reconnection settings.
 * @returns An effect that, when run, yields a `HydraHead` instance or fails with a `HeadError`.
 */
const createEffect = (
  config: HeadConfig,
): Effect.Effect<HydraHead, HeadError> =>
  Effect.gen(function* () {
    const transport = yield* makeHeadTransport(config);
    const router = yield* makeCommandRouter(transport);
    const fsm = yield* makeHeadFsm();

    // Resolve HTTP URL for REST-based operations (e.g. commit)
    const httpUrl = config.httpUrl ?? wsToHttp(config.url);

    // -----------------------------------------------------------------------
    // Managed state via Ref – safe for concurrent reads/writes
    // fsm.status is the single source of truth for HeadStatus
    // -----------------------------------------------------------------------
    const headIdRef = yield* Ref.make<string | null>(null);
    const disposedRef = yield* Ref.make(false);

    // -----------------------------------------------------------------------
    // Central PubSub – single fan-out primitive for all subscribers
    //
    // Using a sliding strategy with capacity 256 so that:
    //   - A slow callback subscriber can't block the projector
    //   - We don't accumulate unboundedly if nobody is listening
    //   - Publishers (the projector) never block
    // -----------------------------------------------------------------------
    const hub = yield* PubSub.sliding<ServerOutput>(256);

    // -----------------------------------------------------------------------
    // Projector fiber – single loop that:
    //   1. Takes raw transport events
    //   2. Applies FSM transitions (which updates fsm.status)
    //   3. Publishes to the PubSub hub
    // -----------------------------------------------------------------------
    const { queue: projected, unsubscribe: unsubscribeProjected } =
      yield* transport.events.subscribe;

    // Deferred that resolves once the first Greetings has been processed,
    // so callers know the FSM reflects the node's actual state.
    const greetingsReceived = yield* Deferred.make<void>();
    // Track whether we've received the initial Greetings to distinguish
    // first connection from reconnections for ConnectionRestored events.
    const greetingsCount = yield* Ref.make(0);

    const projectorFiber = yield* Effect.forkDaemon(
      Effect.forever(
        Queue.take(projected).pipe(
          Effect.flatMap((event) => {
            if (isServerOutput(event)) {
              return Effect.all([
                // FSM handles both validation and state update
                fsm.applyOutputTag(event.output.tag),
                // Publish to hub – sliding means this never blocks
                PubSub.publish(hub, event.output),
              ]).pipe(Effect.asVoid);
            }

            if (event._tag === "Greetings") {
              return Effect.gen(function* () {
                // Capture current FSM status BEFORE syncing to detect changes
                const previousStatus = yield* Ref.get(fsm.status);
                const count = yield* Ref.get(greetingsCount);
                const restoredStatus = event.greetings.headStatus;

                // On reconnect/greeting, force-sync FSM to the server's state.
                const tag = outputTagFromStatus(restoredStatus);
                if (tag !== undefined) {
                  yield* fsm.applyOutputTag(tag);
                } else {
                  yield* Ref.set(fsm.status, restoredStatus);
                }

                if (event.greetings.headId) {
                  yield* Ref.set(headIdRef, event.greetings.headId);
                }

                // Emit ConnectionRestored on reconnection when state differs
                if (count > 0 && previousStatus !== restoredStatus) {
                  yield* PubSub.publish(hub, {
                    tag: "ConnectionRestored",
                    payload: { previousStatus, restoredStatus },
                  });
                }

                yield* Ref.update(greetingsCount, (n) => n + 1);
                yield* Deferred.succeed(greetingsReceived, void 0);
              });
            }

            return Effect.void;
          }),
        ),
      ),
    );

    // Start the WebSocket connection AFTER the projector is subscribed,
    // ensuring Greetings (and any replayed history) is captured by the FSM.
    yield* transport.connect;

    // Wait for the first Greetings to be processed so the FSM reflects
    // the node's actual state before returning the head to callers.
    yield* Deferred.await(greetingsReceived).pipe(
      Effect.timeout("10 seconds"),
      Effect.catchAll(() => Effect.void),
    );

    // -----------------------------------------------------------------------
    // Guard: reject operations after dispose
    // -----------------------------------------------------------------------
    const assertNotDisposed: Effect.Effect<void, HeadError> = Ref.get(
      disposedRef,
    ).pipe(
      Effect.flatMap((disposed) =>
        disposed
          ? Effect.fail(new HeadError({ message: "Head has been disposed" }))
          : Effect.void,
      ),
    );

    // -----------------------------------------------------------------------
    // Command execution
    // -----------------------------------------------------------------------
    const execute = (
      command: ClientInputTag,
      payload: unknown,
      matcher: (event: ApiEvent) => MatchResult<void>,
      timeoutMs: number,
    ): Effect.Effect<void, HeadError> =>
      Effect.gen(function* () {
        yield* assertNotDisposed;
        yield* fsm.assertCommandAllowed(command);
        yield* router.sendAndAwait(
          transport.send(command, payload),
          matcher,
          timeoutMs,
        );
      });

    // -----------------------------------------------------------------------
    // Effect API implementations
    // -----------------------------------------------------------------------

    const initEffect = (params?: InitParams): Effect.Effect<void, HeadError> =>
      Effect.gen(function* () {
        yield* assertNotDisposed;
        yield* fsm.assertCommandAllowed("Init");

        const event = yield* router.sendAndAwait(
          transport.send("Init", params),
          (event) => {
            if (
              event._tag === "ServerOutput" &&
              event.output.tag === "HeadIsInitializing"
            ) {
              return matchSuccess(event.output);
            }
            return isCommandFailure(event, "Init");
          },
          30_000,
        );

        // Extract headId from the HeadIsInitializing payload
        const payload = event.payload as { headId?: string } | undefined;
        yield* Ref.set(headIdRef, payload?.headId ?? null);
      });

    const isMock = config.url.startsWith("mock://");

    const commitEffect = (
      body: CommitRequest,
    ): Effect.Effect<unknown, HeadError> =>
      Effect.gen(function* () {
        yield* assertNotDisposed;
        yield* fsm.assertCommandAllowed("Commit");

        if (isMock) {
          // In mock mode, subscribe first then simulate the REST commit
          // by publishing HeadIsOpen directly.
          yield* router.sendAndAwait(
            transport.events.publish({
              _tag: "ServerOutput",
              output: { tag: "HeadIsOpen", payload: body },
            }),
            matchCommit,
            30_000,
          );
          return undefined;
        }

        // Use sendAndAwait to subscribe *before* POSTing, preventing the
        // race where a fast HeadIsOpen arrives before the listener is ready.
        let draftTx: unknown;
        yield* router.sendAndAwait(
          postCommit(httpUrl, body).pipe(
            Effect.tap((result) =>
              Effect.sync(() => {
                draftTx = result;
              }),
            ),
            Effect.mapError(
              (err) =>
                new HeadError({
                  message: `Commit REST request failed: ${err.message}`,
                  cause: err.cause,
                }),
            ),
            Effect.asVoid,
          ),
          matchCommit,
          30_000,
        );

        return draftTx;
      });

    const closeEffect = (): Effect.Effect<void, HeadError> =>
      execute(
        "Close",
        undefined,
        (event) => matchServerTag(event, "HeadIsClosed", "Close"),
        60_000,
      );

    const safeCloseEffect = (): Effect.Effect<void, HeadError> =>
      execute(
        "SafeClose",
        undefined,
        (event) => matchServerTag(event, "HeadIsClosed", "SafeClose"),
        60_000,
      );

    const awaitReadyToFanoutEffect = (): Effect.Effect<void, HeadError> =>
      Effect.gen(function* () {
        const currentState = yield* Ref.get(fsm.status);

        if (currentState === "Final") {
          return yield* Effect.fail(
            new HeadError({
              message: "Fanout is not allowed when head is already Final",
            }),
          );
        }

        if (currentState === "FanoutPossible") {
          return;
        }

        yield* router.awaitMatch((event) => {
          if (
            event._tag === "ServerOutput" &&
            event.output.tag === "ReadyToFanout"
          ) {
            return matchSuccess(undefined);
          }
          return matchContinue();
        }, 60_000);
      });

    const fanoutEffect = (): Effect.Effect<void, HeadError> =>
      Effect.zipRight(
        awaitReadyToFanoutEffect(),
        execute(
          "Fanout",
          undefined,
          (event) => matchServerTag(event, "HeadIsFinalized", "Fanout"),
          90_000,
        ),
      );

    const abortEffect = (): Effect.Effect<void, HeadError> =>
      execute(
        "Abort",
        undefined,
        (event) => matchServerTag(event, "HeadIsAborted", "Abort"),
        30_000,
      );

    const newTxEffect = (transaction: {
      type: string;
      description: string;
      cborHex: string;
      txId: string;
    }): Effect.Effect<void, HeadError> =>
      Effect.gen(function* () {
        yield* assertNotDisposed;
        yield* fsm.assertCommandAllowed("NewTx");

        yield* router.sendAndAwait(
          transport.send("NewTx", transaction),
          (event) => {
            if (
              event._tag === "ServerOutput" &&
              event.output.tag === "TxValid"
            ) {
              const payload = event.output.payload as
                | { transactionId?: string }
                | undefined;
              if (payload?.transactionId === transaction.txId) {
                return matchSuccess(undefined);
              }
            }
            if (
              event._tag === "ServerOutput" &&
              event.output.tag === "TxInvalid"
            ) {
              const payload = event.output.payload as
                | {
                    transaction?: { txId?: string };
                    validationError?: { reason?: string };
                  }
                | undefined;
              if (payload?.transaction?.txId === transaction.txId) {
                return matchFailure(
                  new HeadError({
                    message:
                      payload.validationError?.reason ??
                      `Transaction ${transaction.txId} was invalid`,
                    details: {
                      tag: "TxInvalid",
                      command: "NewTx",
                      txId: transaction.txId,
                      validationError: payload.validationError,
                    },
                  }),
                );
              }
            }
            return isCommandFailure(event, "NewTx");
          },
          30_000,
        );
      });

    const recoverEffect = (
      recoverTxId: string,
    ): Effect.Effect<void, HeadError> =>
      Effect.gen(function* () {
        yield* assertNotDisposed;
        yield* fsm.assertCommandAllowed("Recover");

        yield* router.sendAndAwait(
          transport.send("Recover", { recoverTxId }),
          (event) => {
            if (
              event._tag === "ServerOutput" &&
              event.output.tag === "CommitRecovered"
            ) {
              const payload = event.output.payload as
                | { recoveredTxId?: string }
                | undefined;
              if (payload?.recoveredTxId === recoverTxId) {
                return matchSuccess(undefined);
              }
            }
            if (
              event._tag === "ServerOutput" &&
              event.output.tag === "DepositExpired"
            ) {
              const payload = event.output.payload as
                | { depositTxId?: string }
                | undefined;
              return matchFailure(
                new HeadError({
                  message: `Deposit expired for transaction ${payload?.depositTxId ?? recoverTxId}`,
                  details: {
                    tag: "DepositExpired",
                    command: "Recover",
                    txId: payload?.depositTxId ?? recoverTxId,
                  },
                }),
              );
            }
            return isCommandFailure(event, "Recover");
          },
          60_000,
        );
      });

    const decommitEffect = (decommitTx: {
      type: string;
      description: string;
      cborHex: string;
      txId: string;
    }): Effect.Effect<void, HeadError> =>
      Effect.gen(function* () {
        yield* assertNotDisposed;
        yield* fsm.assertCommandAllowed("Decommit");

        yield* router.sendAndAwait(
          transport.send("Decommit", decommitTx),
          (event) => {
            if (
              event._tag === "ServerOutput" &&
              event.output.tag === "DecommitApproved"
            ) {
              const payload = event.output.payload as
                | { decommitTxId?: string }
                | undefined;
              if (payload?.decommitTxId === decommitTx.txId) {
                return matchSuccess(undefined);
              }
            }
            if (
              event._tag === "ServerOutput" &&
              event.output.tag === "DecommitInvalid"
            ) {
              const payload = event.output.payload as
                | {
                    decommitTx?: { txId?: string };
                    decommitInvalidReason?: { tag?: string };
                  }
                | undefined;
              if (payload?.decommitTx?.txId === decommitTx.txId) {
                return matchFailure(
                  new HeadError({
                    message:
                      payload.decommitInvalidReason?.tag ??
                      `Decommit transaction ${decommitTx.txId} was invalid`,
                    details: {
                      tag: "DecommitInvalid",
                      command: "Decommit",
                      txId: decommitTx.txId,
                      validationError: payload.decommitInvalidReason,
                    },
                  }),
                );
              }
            }
            return isCommandFailure(event, "Decommit");
          },
          60_000,
        );
      });

    const contestEffect = (): Effect.Effect<void, HeadError> =>
      execute(
        "Contest",
        undefined,
        (event) => matchServerTag(event, "HeadIsContested", "Contest"),
        60_000,
      );

    // -----------------------------------------------------------------------
    // Fire-and-forget send
    // -----------------------------------------------------------------------

    const sendEffect = (
      command: ClientInputTag,
      payload?: unknown,
    ): Effect.Effect<void, HeadError> =>
      Effect.gen(function* () {
        yield* assertNotDisposed;
        yield* fsm.assertCommandAllowed(command);
        yield* transport.send(command, payload);
      });

    // -----------------------------------------------------------------------
    // Event streams – derived from PubSub, no manual bookkeeping
    // -----------------------------------------------------------------------

    /**
     * Each call to `events()` creates an independent subscriber to the hub.
     * The subscription is scoped – when the consuming fiber/scope ends, the
     * subscription is automatically cleaned up by Effect's resource management.
     */
    const eventsStream = (): Stream.Stream<ServerOutput> =>
      Stream.fromPubSub(hub);

    // -----------------------------------------------------------------------
    // Dispose – structured teardown
    // -----------------------------------------------------------------------

    const disposeEffect = (): Effect.Effect<void, HeadError> =>
      Effect.gen(function* () {
        // Idempotent dispose
        const alreadyDisposed = yield* Ref.getAndSet(disposedRef, true);
        if (alreadyDisposed) return;

        yield* Fiber.interrupt(projectorFiber);
        yield* unsubscribeProjected;
        yield* Queue.shutdown(projected).pipe(Effect.orDie);
        yield* PubSub.shutdown(hub).pipe(Effect.orDie);
        yield* transport.dispose;
        yield* Ref.set(fsm.status, "Idle");
        yield* Ref.set(headIdRef, null);
      });

    // -----------------------------------------------------------------------
    // Callback-based subscribe (Promise API compatibility)
    //
    // Forks a scoped fiber that subscribes to the PubSub and dispatches to
    // the callback. Interrupting the fiber tears down the scope, which
    // automatically unsubscribes from the PubSub.
    // -----------------------------------------------------------------------

    const subscribe = (
      callback: (event: ServerOutput) => void,
    ): Unsubscribe => {
      // Effect.scoped ensures PubSub.subscribe's Scope finalizer runs on interrupt
      const fiber = Effect.runFork(
        Effect.scoped(
          Effect.gen(function* () {
            const dequeue = yield* PubSub.subscribe(hub);
            yield* Effect.forever(
              Queue.take(dequeue).pipe(
                Effect.tap((output) => Effect.sync(() => callback(output))),
              ),
            );
          }),
        ),
      );

      let cancelled = false;

      return () => {
        if (cancelled) return;
        cancelled = true;
        Effect.runFork(Fiber.interrupt(fiber));
      };
    };

    // -----------------------------------------------------------------------
    // Async iterator (Promise API compatibility)
    //
    // Manually manages a PubSub subscription scope so we can yield events
    // and guarantee cleanup when the iterator is abandoned (via finally).
    // -----------------------------------------------------------------------

    const subscribeEvents =
      async function* (): AsyncIterableIterator<ServerOutput> {
        // Create a manual scope so we control when it closes
        const scope = Effect.runSync(Scope.make());

        // Subscribe within that scope – the dequeue will be cleaned up
        // when we close the scope
        const dequeue = await Effect.runPromise(
          PubSub.subscribe(hub).pipe(Scope.extend(scope)),
        );

        try {
          while (true) {
            const event = await Effect.runPromise(Queue.take(dequeue));
            yield event;
          }
        } finally {
          // Close scope → PubSub unsubscribes → dequeue shuts down
          await Effect.runPromise(Scope.close(scope, Exit.void));
        }
      };

    // -----------------------------------------------------------------------
    // Promise API helper
    // -----------------------------------------------------------------------

    const runEffect = <A>(op: Effect.Effect<A, HeadError>): Promise<A> =>
      Effect.runPromise(op);

    // -----------------------------------------------------------------------
    // Assemble handle
    // -----------------------------------------------------------------------

    const effectApi = {
      init: initEffect,
      commit: commitEffect,
      close: closeEffect,
      safeClose: safeCloseEffect,
      fanout: fanoutEffect,
      awaitReadyToFanout: awaitReadyToFanoutEffect,
      abort: abortEffect,
      newTx: newTxEffect,
      recover: recoverEffect,
      decommit: decommitEffect,
      contest: contestEffect,
      send: sendEffect,
      events: eventsStream,
      dispose: disposeEffect,
    };

    const handle: HydraHead = {
      get state() {
        return Effect.runSync(Ref.get(fsm.status));
      },
      get headId() {
        return Effect.runSync(Ref.get(headIdRef));
      },

      getState: () => Effect.runSync(Ref.get(fsm.status)),

      init: (params?: InitParams) => runEffect(effectApi.init(params)),
      commit: (body: CommitRequest) => runEffect(effectApi.commit(body)),
      close: () => runEffect(effectApi.close()),
      safeClose: () => runEffect(effectApi.safeClose()),
      fanout: () => runEffect(effectApi.fanout()),
      abort: () => runEffect(effectApi.abort()),
      newTx: (transaction) => runEffect(effectApi.newTx(transaction)),
      recover: (recoverTxId) => runEffect(effectApi.recover(recoverTxId)),
      decommit: (decommitTx) => runEffect(effectApi.decommit(decommitTx)),
      contest: () => runEffect(effectApi.contest()),
      send: (command, payload) => runEffect(effectApi.send(command, payload)),
      subscribe,
      subscribeEvents,
      dispose: () => runEffect(effectApi.dispose()),

      effect: effectApi,
    };

    return handle;
  });

// ---------------------------------------------------------------------------
// Scoped / Layer / convenience
// ---------------------------------------------------------------------------
/**
 * Creates a scoped `Effect` that acquires a `HydraHead` and automatically
 * disposes it when the scope closes.
 *
 * Intended for use with `Effect.scoped` or inside a scoped layer. For manual
 * lifecycle management, prefer `effect.create`.
 *
 * @param config - Connection configuration.
 * @returns An `Effect` that yields a `HydraHead` and ensures cleanup on scope exit.
 */
const createScopedEffect = (config: HeadConfig) =>
  Effect.acquireRelease(createEffect(config), (head) =>
    head.effect.dispose().pipe(Effect.orDie),
  );

/**
 * Effect-native factory functions for creating `HydraHead` instances.
 *
 * Prefer these over `create`/ `withHead` when composing with the
 * Effect runtime, as they integrate with Effect's structured concurrency,
 * resource management, and typed error channel.
 *
 * @category Constructors
 *
 * @example
 * ```ts
 * // effect.create — manual lifecycle
 * import { Effect } from "effect";
 * import { Head } from "@no-witness-labs/hydra-sdk";
 *
 * const program = Effect.gen(function* () {
 *   const head = yield* Head.effect.create({ url: "ws://localhost:9944" });
 *   yield* head.effect.init();
 *   // ... do work ...
 *   yield* head.effect.dispose();
 * });
 * ```
 *
 * @example
 * ```ts
 * // effect.createScoped — automatic disposal
 * import { Effect } from "effect";
 * import { Head } from "@no-witness-labs/hydra-sdk";
 *
 * const program = Effect.scoped(
 *   Effect.gen(function* () {
 *     const head = yield* Head.effect.createScoped({ url: "ws://localhost:9944" });
 *     yield* head.effect.init();
 *   }),
 * );
 * ```
 */
export const effect = {
  /**
   * Creates a `HydraHead` as an `Effect`.
   *
   * Caller is responsible for calling `head.effect.dispose()` when done.
   * For automatic resource cleanup, prefer `effect.createScoped`.
   *
   * @param config - Connection configuration.
   *
   * @example
   * ```ts
   * import { Effect } from "effect";
   * import { Head } from "@no-witness-labs/hydra-sdk";
   *
   * const program = Effect.gen(function* () {
   *   const head = yield* Head.effect.create({ url: "ws://localhost:9944" });
   *   yield* head.effect.init();
   *   yield* head.effect.dispose();
   * });
   * ```
   */
  create: createEffect,

  /**
   * Creates a `HydraHead` as a scoped `Effect` that automatically calls
   * `head.effect.dispose()` when the enclosing `Scope` is closed.
   *
   * Intended to be used with `Effect.scoped` or inside a scoped layer.
   *
   * @param config - Connection configuration.
   *
   * @example
   * ```ts
   * import { Effect } from "effect";
   * import { Head } from "@no-witness-labs/hydra-sdk";
   *
   * const program = Effect.scoped(
   *   Effect.gen(function* () {
   *     const head = yield* Head.effect.createScoped({ url: "ws://localhost:9944" });
   *     yield* head.effect.init();
   *     // dispose() runs automatically when Effect.scoped closes
   *   }),
   * );
   *
   * await Effect.runPromise(program);
   * ```
   */
  createScoped: createScopedEffect,
};

/**
 * Creates a `HydraHead` connected to the given `config` and returns it
 * as a `Promise`.
 *
 * You are responsible for calling `head.dispose()` when finished to release
 * the WebSocket connection and internal resources. For automatic cleanup,
 * prefer `withHead`.
 *
 * @category Constructors
 *
 * @param config - Connection and reconnection options.
 * @returns A `Promise` that resolves to a connected `HydraHead` instance.
 *
 * @example
 * ```ts
 * import { Head } from "@no-witness-labs/hydra-sdk";
 *
 * async function example() {
 *   const head = await Head.create({ url: "ws://localhost:9944" });
 *   console.log(head.getState()); // "Idle"
 *
 *   await head.init();
 *   console.log(head.getState()); // "Initializing"
 *
 *   await head.dispose();
 * }
 * ```
 */
export const create = (config: HeadConfig): Promise<HydraHead> =>
  Effect.runPromise(createEffect(config));

/**
 * Resource-safe bracket pattern for the Promise API.
 *
 * Creates a `HydraHead`, runs `body` with it, then unconditionally calls
 * `head.dispose()`— even if `body` throws. Equivalent to
 * `Effect.acquireRelease`/ `using` for imperative async code.
 *
 * @category Constructors
 *
 * @param config - Connection and reconnection options.
 * @param body   - Async callback that receives the connected head and returns
 *   a result value `A`.
 * @returns A `Promise` that resolves to the value returned by `body`.
 *
 * @example
 * ```ts
 * import { Head } from "@no-witness-labs/hydra-sdk";
 *
 * async function example() {
 *   const result = await Head.withHead(
 *     { url: "ws://localhost:9944" },
 *     async (head) => {
 *       await head.init();
 *       // ... do work ...
 *       await head.close();
 *       await head.fanout();
 *       return head.getState(); // "Final"
 *     },
 *   );
 *
 *   console.log(result); // "Final"
 *   // head.dispose() was called automatically
 * }
 * ```
 */
export const withHead = async <A>(
  config: HeadConfig,
  body: (head: HydraHead) => Promise<A>,
): Promise<A> => {
  const head = await create(config);
  try {
    return await body(head);
  } finally {
    await head.dispose();
  }
};

/**
 * Effect `Context.Tag` for dependency-injecting a `HydraHead` through
 * the Effect service layer.
 *
 * Use `layer` to construct a `Layer` that provides this service, then
 * use `Effect.provideLayer` or `Effect.provide` to wire it into your program.
 *
 * @category Tags
 *
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { Head } from "@no-witness-labs/hydra-sdk";
 *
 * const program = Effect.gen(function* () {
 *   const head = yield* Head.HydraHeadService;
 *   yield* head.effect.init();
 *   console.log(head.getState()); // "Initializing"
 * });
 *
 * const runnable = program.pipe(
 *   Effect.provide(Head.layer({ url: "ws://localhost:9944" })),
 * );
 * ```
 */
export class HydraHeadService extends Context.Tag("HydraHeadService")<
  HydraHeadService,
  HydraHead
>() {}

/**
 * Constructs an Effect `Layer` that provides a scoped `HydraHead`
 * instance via the `HydraHeadService` tag.
 *
 * The head is created when the layer is built and automatically disposed when
 * the layer's scope is released, making it safe for use with
 * `ManagedRuntime` or application-level lifecycle management.
 *
 * @category layers
 *
 * @param config - Connection and reconnection options for the head.
 * @returns A `Layer` providing `HydraHeadService`, failing with
 *   `HeadError` on connection error.
 *
 * @example
 * ```ts
 * import { Effect, Layer } from "effect";
 * import { Head } from "@no-witness-labs/hydra-sdk";
 *
 * const HeadLayer = Head.layer({ url: "ws://localhost:9944" });
 *
 * const program = Effect.gen(function* () {
 *   const head = yield* Head.HydraHeadService;
 *   yield* head.effect.init();
 * });
 *
 * const runnable = program.pipe(Effect.provide(HeadLayer));
 * ```
 *
 * @example
 * ```ts
 * // Composing with other layers
 * import { Effect, Layer } from "effect";
 * import { Head } from "@no-witness-labs/hydra-sdk";
 *
 * const AppLayer = Layer.mergeAll(
 *   Head.layer({ url: "ws://localhost:9944" }),
 *   // ... other service layers ...
 * );
 *
 * const program = Effect.gen(function* () {
 *   const head = yield* Head.HydraHeadService;
 *   yield* head.effect.init();
 * });
 *
 * const runnable = program.pipe(Effect.provide(AppLayer));
 * ```
 */
export const layer = (
  config: HeadConfig,
): Layer.Layer<HydraHeadService, HeadError> =>
  Layer.scoped(HydraHeadService, createScopedEffect(config));
