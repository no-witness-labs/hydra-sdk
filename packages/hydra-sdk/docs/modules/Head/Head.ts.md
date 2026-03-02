---
title: Head/Head.ts
nav_order: 1
parent: Modules
---

## Head overview

---

<h2 class="text-delta">Table of contents</h2>

- [constructors](#constructors)
  - [create](#create)
  - [effect](#effect)
  - [withHead](#withhead)
- [errors](#errors)
  - [HeadError (class)](#headerror-class)
- [layers](#layers)
  - [layer](#layer)
- [model](#model)
  - [ApiEvent (type alias)](#apievent-type-alias)
  - [ClientInputTag (type alias)](#clientinputtag-type-alias)
  - [ClientMessage (interface)](#clientmessage-interface)
  - [Greetings (interface)](#greetings-interface)
  - [HeadConfig (interface)](#headconfig-interface)
  - [HeadStatus (type alias)](#headstatus-type-alias)
  - [HydraHead (interface)](#hydrahead-interface)
  - [InitParams (interface)](#initparams-interface)
  - [InvalidInput (interface)](#invalidinput-interface)
  - [ServerOutput (interface)](#serveroutput-interface)
  - [Unsubscribe (type alias)](#unsubscribe-type-alias)
- [tags](#tags)
  - [HydraHeadService (class)](#hydraheadservice-class)

---

# constructors

## create

Creates a `HydraHead` connected to the given `config` and returns it
as a `Promise`.

You are responsible for calling `head.dispose()` when finished to release
the WebSocket connection and internal resources. For automatic cleanup,
prefer `withHead`.

**Signature**

```ts
export declare const create: (config: HeadConfig) => Promise<HydraHead>
```

**Example**

```ts
import { Head } from "@no-witness-labs/hydra-sdk"

async function example() {
  const head = await Head.create({ url: "ws://localhost:9944" })
  console.log(head.getState()) // "Idle"

  await head.init()
  console.log(head.getState()) // "Initializing"

  await head.dispose()
}
```

## effect

Effect-native factory functions for creating `HydraHead` instances.

Prefer these over `create`/ `withHead` when composing with the
Effect runtime, as they integrate with Effect's structured concurrency,
resource management, and typed error channel.

**Signature**

```ts
export declare const effect: {
  create: (config: HeadConfig) => Effect.Effect<HydraHead, HeadError>
  createScoped: (config: HeadConfig) => Effect.Effect<HydraHead, HeadError, Scope.Scope>
}
```

**Example**

```ts
// effect.create — manual lifecycle
import { Effect } from "effect"
import { Head } from "@no-witness-labs/hydra-sdk"

const program = Effect.gen(function* () {
  const head = yield* Head.effect.create({ url: "ws://localhost:9944" })
  yield* head.effect.init()
  // ... do work ...
  yield* head.effect.dispose()
})
```

**Example**

```ts
// effect.createScoped — automatic disposal
import { Effect } from "effect"
import { Head } from "@no-witness-labs/hydra-sdk"

const program = Effect.scoped(
  Effect.gen(function* () {
    const head = yield* Head.effect.createScoped({ url: "ws://localhost:9944" })
    yield* head.effect.init()
  })
)
```

## withHead

Resource-safe bracket pattern for the Promise API.

Creates a `HydraHead`, runs `body` with it, then unconditionally calls
`head.dispose()`— even if `body` throws. Equivalent to
`Effect.acquireRelease`/ `using` for imperative async code.

**Signature**

```ts
export declare const withHead: <A>(config: HeadConfig, body: (head: HydraHead) => Promise<A>) => Promise<A>
```

**Example**

```ts
import { Head } from "@no-witness-labs/hydra-sdk"

async function example() {
  const result = await Head.withHead({ url: "ws://localhost:9944" }, async (head) => {
    await head.init()
    // ... do work ...
    await head.close()
    await head.fanout()
    return head.getState() // "Final"
  })

  console.log(result) // "Final"
  // head.dispose() was called automatically
}
```

# errors

## HeadError (class)

Tagged error type representing any failure that can occur during Hydra Head operations,
such as command rejections, timeouts, transport errors, or protocol violations.

**Signature**

```ts
export declare class HeadError
```

# layers

## layer

Constructs an Effect `Layer` that provides a scoped `HydraHead`
instance via the `HydraHeadService` tag.

The head is created when the layer is built and automatically disposed when
the layer's scope is released, making it safe for use with
`ManagedRuntime` or application-level lifecycle management.

**Signature**

```ts
export declare const layer: (config: HeadConfig) => Layer.Layer<HydraHeadService, HeadError>
```

**Example**

```ts
import { Effect, Layer } from "effect"
import { Head } from "@no-witness-labs/hydra-sdk"

const HeadLayer = Head.layer({ url: "ws://localhost:9944" })

const program = Effect.gen(function* () {
  const head = yield* Head.HydraHeadService
  yield* head.effect.init()
})

const runnable = program.pipe(Effect.provide(HeadLayer))
```

**Example**

```ts
// Composing with other layers
import { Effect, Layer } from "effect"
import { Head } from "@no-witness-labs/hydra-sdk"

const AppLayer = Layer.mergeAll(
  Head.layer({ url: "ws://localhost:9944" })
  // ... other service layers ...
)

const program = Effect.gen(function* () {
  const head = yield* Head.HydraHeadService
  yield* head.effect.init()
})

const runnable = program.pipe(Effect.provide(AppLayer))
```

# model

## ApiEvent (type alias)

Discriminated union of every event type that can arrive from hydra-node or
be generated internally by the SDK transport layer.

**Signature**

```ts
export type ApiEvent =
  | { readonly _tag: "ServerOutput"; readonly output: ServerOutput }
  | { readonly _tag: "ClientMessage"; readonly message: ClientMessage }
  | { readonly _tag: "Greetings"; readonly greetings: Greetings }
  | { readonly _tag: "InvalidInput"; readonly invalidInput: InvalidInput }
```

## ClientInputTag (type alias)

Discriminated union of all WebSocket command tags a client can send to
hydra-node.

**Signature**

```ts
export type ClientInputTag =
  | "Init"
  // TODO(protocol-schema): Commit is REST-based in Hydra; retained here as scaffold API surface.
  | "Commit"
  | "Close"
  // TODO(protocol-schema): SafeClose is scaffold-only and not part of Hydra websocket commands.
  | "SafeClose"
  | "Fanout"
  | "Abort"
```

## ClientMessage (interface)

Failure envelope returned by hydra-node when a client command is rejected.

**Signature**

```ts
export interface ClientMessage {
  /** Discriminating tag that identifies which command failed. */
  readonly tag: "CommandFailed" | "RejectedInputBecauseUnsynced" | "PostTxOnChainFailed"
  /** Optional tag of the client command that triggered this failure, if applicable. */
  readonly clientInputTag?: ClientInputTag
  /** Optional human-readable explanation of why the command failed. */
  readonly reason?: string
}
```

## Greetings (interface)

Initial greeting payload sent by hydra-node on every (re)connection,
carrying the current head state so the client can sync without replaying
history.

**Signature**

```ts
export interface Greetings {
  /** The head state as known by hydra-node at the time of the greeting. */
  readonly headStatus: HeadStatus
}
```

## HeadConfig (interface)

Connection and reconnection configuration for a Hydra Head.

**Signature**

```ts
export interface HeadConfig {
  /** WebSocket URL of the hydra-node API (e.g. `"ws://localhost:9944"`). */
  readonly url: string
  /**
   * When `true`, the hydra-node will replay all past server outputs upon the
   * initial WebSocket connection so the client can reconstruct current state.
   */
  readonly historyOnConnect?: boolean
  /**
   * When `true`, the hydra-node replays past server outputs after each
   * automatic reconnection attempt.
   */
  readonly historyOnReconnect?: boolean
  /** Optional exponential back-off parameters for automatic reconnection. */
  readonly reconnect?: {
    /** Optional maximum number of reconnection attempts before giving up. */
    readonly maxRetries?: number
    /** Optional delay in milliseconds before the first reconnection attempt. */
    readonly initialDelayMs?: number
    /** Optional upper bound in milliseconds for the back-off delay. */
    readonly maxDelayMs?: number
    /** Optional multiplier applied to the delay after each failed attempt. */
    readonly factor?: number
    /** Optional random jitter factor in the range `[0, 1]` (inclusive) added to each delay to avoid thundering herd. The SDK does not perform runtime validation of this range and forwards the value to the underlying reconnection implementation; callers are responsible for only providing values within the documented range. */
    readonly jitter?: number
  }
}
```

## HeadStatus (type alias)

All possible lifecycle states of a Hydra Head.

Transitions are driven exclusively by server-side events emitted by
hydra-node over the WebSocket connection. The normal happy-path is:
`Idle → Initializing → Open → Closed → FanoutPossible → Final`.

**Signature**

```ts
export type HeadStatus = "Idle" | "Initializing" | "Open" | "Closed" | "FanoutPossible" | "Final" | "Aborted"
```

## HydraHead (interface)

Primary interface representing a Hydra Head instance. Provides methods to execute
protocol commands, subscribe to server events, and manage the head lifecycle.

**Signature**

````ts
export interface HydraHead {
  /**
   * Current `HeadStatus` of this head, read synchronously from the
   * in-memory FSM state.
   */
  readonly state: HeadStatus

  /**
   * Unique identifier for the Hydra Head.
   *
   * Set to a placeholder value after `init()` is acknowledged and reset to
   * `null` after `dispose()`. Full extraction from the `HeadIsInitializing`
   * payload is pending protocol-schema integration.
   */
  readonly headId: string | null

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
  getState(): HeadStatus

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
  init(params?: InitParams): Promise<void>

  /**
   * Sends the `Commit` command to hydra-node to commit UTxOs into the head.
   *
   * Resolves once `HeadIsOpen` is received, indicating all participants have
   * committed and the head is ready for off-chain transactions.
   *
   * > **Note:** Commit is REST-driven in the Hydra protocol. This WebSocket
   * > scaffold signature is temporary and will be replaced when protocol-schema
   * > integration lands.
   *
   * @param utxos - UTxO set to commit; type will be narrowed to the protocol
   *   Transaction type in a future release.
   *
   * @example Promise API
   * ```ts
   * import { Head } from "@no-witness-labs/hydra-sdk";
   *
   * const head = await Head.create({ url: "ws://localhost:9944" });
   * await head.init();
   * await head.commit({ txHash: "abc...", txIx: 0 });
   * console.log(head.getState()); // "Open"
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
   *   yield* head.effect.commit({ txHash: "abc...", txIx: 0 });
   * });
   * ```
   */
  // TODO(protocol-schema): replace unknown with protocol Transaction type.
  // Commit is REST-driven in Hydra and this scaffold signature is temporary.
  commit(utxos: unknown): Promise<void>

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
  close(): Promise<void>

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
  safeClose(): Promise<void>

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
  fanout(): Promise<void>

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
  abort(): Promise<void>

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
  subscribe(callback: (event: ServerOutput) => void): Unsubscribe

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
  subscribeEvents(): AsyncIterableIterator<ServerOutput>

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
  dispose(): Promise<void>

  /**
   * Effect-native counterparts of every Promise API method, plus additional
   * Effect-only operations (`events`, `awaitReadyToFanout`).
   *
   * All methods return `Effect.Effect<void, HeadError>` unless noted
   * otherwise, making them composable with the full Effect ecosystem.
   */
  readonly effect: {
    init(params?: InitParams): Effect.Effect<void, HeadError>
    // TODO(protocol-schema): replace unknown with protocol Transaction type.
    // Commit is REST-driven in Hydra and this scaffold signature is temporary.
    commit(utxos: unknown): Effect.Effect<void, HeadError>
    close(): Effect.Effect<void, HeadError>
    safeClose(): Effect.Effect<void, HeadError>
    fanout(): Effect.Effect<void, HeadError>
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
    awaitReadyToFanout(): Effect.Effect<void, HeadError>
    abort(): Effect.Effect<void, HeadError>
    events(): Stream.Stream<ServerOutput>
    dispose(): Effect.Effect<void, HeadError>
  }
}
````

**Example**

```ts
// Promise API — full lifecycle
import { Head } from "@no-witness-labs/hydra-sdk"

async function example() {
  const head = await Head.create({ url: "ws://localhost:4001" })

  await head.init()
  await head.commit({ txHash: "abc...", txIx: 0 })
  await head.close()
  await head.fanout()
  console.log(head.getState()) // "Final"

  await head.dispose()
}
```

**Example**

```ts
// Effect API — full lifecycle
import { Effect } from "effect"
import { Head } from "@no-witness-labs/hydra-sdk"

const program = Effect.gen(function* () {
  const head = yield* Head.effect.create({ url: "ws://localhost:4001" })

  yield* head.effect.init()
  yield* head.effect.commit({ txHash: "abc...", txIx: 0 })
  yield* head.effect.close()
  yield* head.effect.fanout()
  console.log(head.getState()) // "Final"

  yield* head.effect.dispose()
})
```

## InitParams (interface)

Parameters for the `Init` command that opens a new Hydra Head on the L1
chain.

**Signature**

```ts
export interface InitParams {
  // TODO(protocol-schema): Hydra websocket Init currently has no payload.
  // Keep this reserved field scaffold-only until protocol schema integration.
  /** Optional contestation period in seconds; if provided, overrides the default configured in hydra-node. */
  readonly contestationPeriod?: number
}
```

## InvalidInput (interface)

Rejection payload emitted when hydra-node cannot parse or route a client
message.

**Signature**

```ts
export interface InvalidInput {
  /** Human-readable explanation of why the input was rejected. */
  readonly reason: string
  /** The raw input string that was rejected, if available. */
  readonly input?: string
}
```

## ServerOutput (interface)

A raw event envelope emitted by hydra-node over the WebSocket connection.

**Signature**

```ts
export interface ServerOutput {
  /** Discriminating tag that identifies the hydra-node event type. */
  readonly tag: string
  /** Optional event-specific payload; shape varies by `tag`. */
  readonly payload?: unknown
}
```

## Unsubscribe (type alias)

Function type returned by `HydraHead.subscribe` to cancel the subscription.

**Signature**

```ts
export type Unsubscribe = () => void
```

# tags

## HydraHeadService (class)

Effect `Context.Tag` for dependency-injecting a `HydraHead` through
the Effect service layer.

Use `layer` to construct a `Layer` that provides this service, then
use `Effect.provideLayer` or `Effect.provide` to wire it into your program.

**Signature**

```ts
export declare class HydraHeadService
```

**Example**

```ts
import { Effect } from "effect"
import { Head } from "@no-witness-labs/hydra-sdk"

const program = Effect.gen(function* () {
  const head = yield* Head.HydraHeadService
  yield* head.effect.init()
  console.log(head.getState()) // "Initializing"
})

const runnable = program.pipe(Effect.provide(Head.layer({ url: "ws://localhost:9944" })))
```
