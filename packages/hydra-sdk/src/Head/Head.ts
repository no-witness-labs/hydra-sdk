import {
  Context,
  Data,
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

import {
  makeHeadFsm,
  outputTagFromStatus,
} from "./Head.fsm.js";
import { makeHeadHttpClient } from "./Head.http.js";
import type { MatchResult } from "./Head.router.js";
import {
  makeCommandRouter,
  matchContinue,
  matchFailure,
  matchSuccess,
} from "./Head.router.js";
import { isServerOutput, makeHeadTransport } from "./Head.transport.js";

export type HeadStatus =
  | "Idle"
  | "Initializing"
  | "Open"
  | "Closed"
  | "FanoutPossible"
  | "Final"
  | "Aborted";

export interface HeadConfig {
  readonly url: string;
  readonly historyOnConnect?: boolean;
  readonly historyOnReconnect?: boolean;
  readonly reconnect?: {
    readonly maxRetries?: number;
    readonly initialDelayMs?: number;
    readonly maxDelayMs?: number;
    readonly factor?: number;
    readonly jitter?: number;
  };
}

export interface InitParams {
  // TODO(protocol-schema): Hydra websocket Init currently has no payload.
  // Keep this reserved field scaffold-only until protocol schema integration.
  readonly contestationPeriod?: number;
}

export interface ServerOutput {
  readonly tag: string;
  readonly payload?: unknown;
}

export type ClientInputTag =
  | "Init"
  // TODO(protocol-schema): Commit is REST-based in Hydra; retained here as scaffold API surface.
  | "Commit"
  // TODO(protocol-schema): NewTx payload should use Protocol Transaction schema.
  | "NewTx"
  | "Close"
  // TODO(protocol-schema): SafeClose is scaffold-only and not part of Hydra websocket commands.
  | "SafeClose"
  | "Contest"
  | "Fanout"
  | "Abort"
  // TODO(protocol-schema): Decommit / Recover payloads should use Protocol schemas.
  | "Decommit"
  | "Recover";

export interface ClientMessage {
  readonly tag:
    | "CommandFailed"
    | "RejectedInputBecauseUnsynced"
    | "PostTxOnChainFailed";
  readonly clientInputTag?: ClientInputTag;
  readonly reason?: string;
}

export interface Greetings {
  readonly headStatus: HeadStatus;
}

export interface InvalidInput {
  readonly reason: string;
  readonly input?: string;
}

export type ApiEvent =
  | { readonly _tag: "ServerOutput"; readonly output: ServerOutput }
  | { readonly _tag: "ClientMessage"; readonly message: ClientMessage }
  | { readonly _tag: "Greetings"; readonly greetings: Greetings }
  | { readonly _tag: "InvalidInput"; readonly invalidInput: InvalidInput };

export type Unsubscribe = () => void;

export class HeadError extends Data.TaggedError("HeadError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export interface HydraHead {
  readonly state: HeadStatus;
  readonly headId: string | null;

  getState(): HeadStatus;

  init(params?: InitParams): Promise<void>;
  // TODO(protocol-schema): replace unknown with protocol Transaction type.
  // Commit is REST-driven in Hydra and this scaffold signature is temporary.
  commit(utxos: unknown): Promise<void>;
  // TODO(protocol-schema): replace unknown with protocol Transaction type.
  newTx(transaction: unknown): Promise<void>;
  close(): Promise<void>;
  safeClose(): Promise<void>;
  // TODO(protocol-schema): replace unknown with protocol Snapshot type.
  contest(): Promise<void>;
  fanout(): Promise<void>;
  abort(): Promise<void>;
  // TODO(protocol-schema): replace unknown with protocol Transaction type.
  decommit(decommitTx: unknown): Promise<void>;
  // TODO(protocol-schema): replace unknown with protocol TxId type.
  recover(recoverTxId: unknown): Promise<void>;

  // -- HTTP query methods (delegate to HeadHttpClient) ----------------------
  // TODO(protocol-schema): replace unknown return types with decoded Protocol
  // schema types once schema integration is complete.
  getProtocolParameters(): Promise<unknown>;
  getSnapshotUtxo(): Promise<unknown>;
  getSnapshot(): Promise<unknown>;
  getCommits(): Promise<unknown>;

  // -- HTTP command methods (delegate to HeadHttpClient) --------------------
  // TODO(protocol-schema): replace unknown param/return with Protocol types.
  submitCommit(blueprintTx: unknown): Promise<unknown>;
  submitTransaction(tx: unknown): Promise<unknown>;
  submitCardanoTransaction(tx: unknown): Promise<unknown>;

  subscribe(callback: (event: ServerOutput) => void): Unsubscribe;
  subscribeEvents(): AsyncIterableIterator<ServerOutput>;
  dispose(): Promise<void>;

  readonly effect: {
    init(params?: InitParams): Effect.Effect<void, HeadError>;
    // TODO(protocol-schema): replace unknown with protocol Transaction type.
    // Commit is REST-driven in Hydra and this scaffold signature is temporary.
    commit(utxos: unknown): Effect.Effect<void, HeadError>;
    // TODO(protocol-schema): replace unknown with protocol Transaction type.
    newTx(transaction: unknown): Effect.Effect<void, HeadError>;
    close(): Effect.Effect<void, HeadError>;
    safeClose(): Effect.Effect<void, HeadError>;
    contest(): Effect.Effect<void, HeadError>;
    fanout(): Effect.Effect<void, HeadError>;
    awaitReadyToFanout(): Effect.Effect<void, HeadError>;
    abort(): Effect.Effect<void, HeadError>;
    // TODO(protocol-schema): replace unknown with protocol Transaction type.
    decommit(decommitTx: unknown): Effect.Effect<void, HeadError>;
    // TODO(protocol-schema): replace unknown with protocol TxId type.
    recover(recoverTxId: unknown): Effect.Effect<void, HeadError>;

    // -- HTTP queries (delegate to HeadHttpClient) --------------------------
    // TODO(protocol-schema): replace unknown return types with decoded types.
    getProtocolParameters(): Effect.Effect<unknown, HeadError>;
    getSnapshotUtxo(): Effect.Effect<unknown, HeadError>;
    getSnapshot(): Effect.Effect<unknown, HeadError>;
    getCommits(): Effect.Effect<unknown, HeadError>;

    // -- HTTP commands (delegate to HeadHttpClient) -------------------------
    // TODO(protocol-schema): replace unknown param/return with Protocol types.
    submitCommit(blueprintTx: unknown): Effect.Effect<unknown, HeadError>;
    submitTransaction(tx: unknown): Effect.Effect<unknown, HeadError>;
    submitCardanoTransaction(tx: unknown): Effect.Effect<unknown, HeadError>;

    events(): Stream.Stream<ServerOutput>;
    dispose(): Effect.Effect<void, HeadError>;
  };
}

// ---------------------------------------------------------------------------
// Command matching helpers
// ---------------------------------------------------------------------------

const isCommandFailure = (
  event: ApiEvent,
  command: ClientInputTag,
): MatchResult<never> => {
  if (event._tag === "InvalidInput") {
    return matchFailure(
      new HeadError({ message: `Invalid input: ${event.invalidInput.reason}` }),
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
      }),
    );
  }

  return matchContinue();
};

const matchServerTag = (
  event: ApiEvent,
  successTag: string,
  command: ClientInputTag,
): MatchResult<void> => {
  if (event._tag === "ServerOutput" && event.output.tag === successTag) {
    return matchSuccess(undefined);
  }

  return isCommandFailure(event, command);
};

// ---------------------------------------------------------------------------
// Core factory
// ---------------------------------------------------------------------------

const createEffect = (
  config: HeadConfig,
): Effect.Effect<HydraHead, HeadError> =>
  Effect.gen(function* () {
    const transport = yield* makeHeadTransport(config);
    const httpClient = yield* makeHeadHttpClient(config.url);
    const router = yield* makeCommandRouter(transport);
    const fsm = yield* makeHeadFsm();

    // -----------------------------------------------------------------------
    // Internal scope – all resources register finalizers here.
    // Closing the scope tears down everything in LIFO order.
    // -----------------------------------------------------------------------
    const scope = yield* Scope.make();

    // -----------------------------------------------------------------------
    // Managed state via Ref – safe for concurrent reads/writes
    // fsm.status is the single source of truth for HeadStatus
    // disposedRef is a lightweight guard for clear error messages on
    // post-dispose operations — the scope handles actual teardown.
    // -----------------------------------------------------------------------
    const headIdRef = yield* Ref.make<string | null>(null);
    const disposedRef = yield* Ref.make(false);

    // -----------------------------------------------------------------------
    // Resource acquisition + finalizer registration
    //
    // Finalizers run LIFO: transport (first registered) disposes last,
    // projector fiber (last registered) is interrupted first.
    // -----------------------------------------------------------------------

    // 1. Transport cleanup (runs last)
    yield* Effect.addFinalizer(() => transport.dispose).pipe(
      Scope.extend(scope),
    );

    // 1b. HTTP client cleanup
    yield* Effect.addFinalizer(() => httpClient.dispose).pipe(
      Scope.extend(scope),
    );

    // 2. PubSub hub
    const hub = yield* PubSub.sliding<ServerOutput>(256);
    yield* Effect.addFinalizer(() =>
      PubSub.shutdown(hub).pipe(Effect.orDie),
    ).pipe(Scope.extend(scope));

    // 3. Projector subscription from transport
    const { queue: projected, unsubscribe: unsubscribeProjected } =
      yield* transport.events.subscribe;
    yield* Effect.addFinalizer(() =>
      unsubscribeProjected.pipe(
        Effect.zipRight(Queue.shutdown(projected).pipe(Effect.orDie)),
      ),
    ).pipe(Scope.extend(scope));

    // 4. Projector fiber (interrupted first on scope close)
    yield* Effect.forkIn(
      Effect.forever(
        Queue.take(projected).pipe(
          Effect.flatMap((event) => {
            if (isServerOutput(event)) {
              return Effect.all([
                fsm.applyOutputTag(event.output.tag),
                PubSub.publish(hub, event.output),
              ]).pipe(Effect.asVoid);
            }

            if (event._tag === "Greetings") {
              const tag = outputTagFromStatus(event.greetings.headStatus);
              return tag !== undefined
                ? fsm.applyOutputTag(tag)
                : Ref.set(fsm.status, event.greetings.headStatus);
            }

            return Effect.void;
          }),
        ),
      ),
      scope,
    );

    // -----------------------------------------------------------------------
    // Guard: reject operations after dispose
    // -----------------------------------------------------------------------
    const assertNotDisposed: Effect.Effect<void, HeadError> = Ref.get(
      disposedRef,
    ).pipe(
      Effect.flatMap((disposed) =>
        disposed
          ? Effect.fail(
              new HeadError({ message: "Head has been disposed" }),
            )
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
      execute(
        "Init",
        params,
        (event) => matchServerTag(event, "HeadIsInitializing", "Init"),
        30_000,
      ).pipe(
        Effect.tap(() =>
          // TODO(protocol-schema): extract headId from HeadIsInitializing payload.
          Ref.set(headIdRef, "dummy-head-id"),
        ),
      );

    const commitEffect = (utxos: unknown): Effect.Effect<void, HeadError> =>
      // TODO(protocol-schema): Commit should be routed through REST integration.
      execute(
        "Commit",
        utxos,
        (event) => matchServerTag(event, "HeadIsOpen", "Commit"),
        30_000,
      );

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

    // -----------------------------------------------------------------------
    // New WS command Effects
    // -----------------------------------------------------------------------

    const newTxEffect = (transaction: unknown): Effect.Effect<void, HeadError> =>
      execute(
        "NewTx",
        { transaction },
        (event) => {
          // TODO(protocol-schema): match TxValid / TxInvalid via Protocol schemas.
          if (event._tag === "ServerOutput" && event.output.tag === "TxValid") {
            return matchSuccess(undefined);
          }
          if (
            event._tag === "ServerOutput" &&
            event.output.tag === "TxInvalid"
          ) {
            const payload = event.output.payload as
              | { validationError?: { reason?: string } }
              | undefined;
            return matchFailure(
              new HeadError({
                message:
                  payload?.validationError?.reason ?? "Transaction is invalid",
              }),
            );
          }
          return isCommandFailure(event, "NewTx");
        },
        30_000,
      );

    const contestEffect = (): Effect.Effect<void, HeadError> =>
      execute(
        "Contest",
        undefined,
        (event) => matchServerTag(event, "HeadIsContested", "Contest"),
        60_000,
      );

    const decommitEffect = (
      decommitTx: unknown,
    ): Effect.Effect<void, HeadError> =>
      execute(
        "Decommit",
        decommitTx,
        (event) => {
          // TODO(protocol-schema): match DecommitFinalized / DecommitInvalid via Protocol schemas.
          if (
            event._tag === "ServerOutput" &&
            event.output.tag === "DecommitFinalized"
          ) {
            return matchSuccess(undefined);
          }
          if (
            event._tag === "ServerOutput" &&
            event.output.tag === "DecommitInvalid"
          ) {
            return matchFailure(
              new HeadError({ message: "Decommit was rejected" }),
            );
          }
          return isCommandFailure(event, "Decommit");
        },
        60_000,
      );

    const recoverEffect = (
      recoverTxId: unknown,
    ): Effect.Effect<void, HeadError> =>
      execute(
        "Recover",
        recoverTxId,
        (event) => {
          // TODO(protocol-schema): match CommitRecovered via Protocol schemas.
          if (
            event._tag === "ServerOutput" &&
            event.output.tag === "CommitRecovered"
          ) {
            return matchSuccess(undefined);
          }
          return isCommandFailure(event, "Recover");
        },
        30_000,
      );

    // -----------------------------------------------------------------------
    // HTTP query/command Effect wrappers
    //
    // These delegate to the HeadHttpClient and gate on assertNotDisposed.
    // TODO(protocol-schema): decode responses via Protocol schema types.
    // -----------------------------------------------------------------------

    const getProtocolParametersEffect = (): Effect.Effect<unknown, HeadError> =>
      assertNotDisposed.pipe(
        Effect.zipRight(httpClient.getProtocolParameters()),
      );

    const getSnapshotUtxoEffect = (): Effect.Effect<unknown, HeadError> =>
      assertNotDisposed.pipe(
        Effect.zipRight(httpClient.getSnapshotUtxo()),
      );

    const getSnapshotEffect = (): Effect.Effect<unknown, HeadError> =>
      assertNotDisposed.pipe(
        Effect.zipRight(httpClient.getSnapshot()),
      );

    const getCommitsEffect = (): Effect.Effect<unknown, HeadError> =>
      assertNotDisposed.pipe(
        Effect.zipRight(httpClient.getCommits()),
      );

    const submitCommitEffect = (
      blueprintTx: unknown,
    ): Effect.Effect<unknown, HeadError> =>
      assertNotDisposed.pipe(
        Effect.zipRight(httpClient.submitCommit(blueprintTx)),
      );

    const submitTransactionEffect = (
      tx: unknown,
    ): Effect.Effect<unknown, HeadError> =>
      assertNotDisposed.pipe(
        Effect.zipRight(httpClient.submitTransaction(tx)),
      );

    const submitCardanoTransactionEffect = (
      tx: unknown,
    ): Effect.Effect<unknown, HeadError> =>
      assertNotDisposed.pipe(
        Effect.zipRight(httpClient.submitCardanoTransaction(tx)),
      );

    // -----------------------------------------------------------------------
    // Event streams – derived from PubSub, no manual bookkeeping
    // -----------------------------------------------------------------------

    const eventsStream = (): Stream.Stream<ServerOutput> =>
      Stream.fromPubSub(hub);

    // -----------------------------------------------------------------------
    // Dispose – close the internal scope
    //
    // Scope.close runs all finalizers in LIFO order:
    //   1. Interrupt projector fiber
    //   2. Unsubscribe + shutdown projected queue
    //   3. Shutdown PubSub hub
    //   4. Dispose transport
    //
    // Scope.close is idempotent — calling dispose() twice is safe.
    // -----------------------------------------------------------------------

    const disposeEffect = (): Effect.Effect<void> =>
      Ref.set(disposedRef, true).pipe(
        Effect.zipRight(Scope.close(scope, Exit.void)),
      );

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
      const fiber = Effect.runFork(
        Effect.scoped(
          Effect.gen(function* () {
            const dequeue = yield* PubSub.subscribe(hub);
            yield* Effect.forever(
              Queue.take(dequeue).pipe(
                Effect.tap((output) =>
                  Effect.sync(() => callback(output)),
                ),
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
    // Uses a dedicated scope for the subscription lifetime. The scope
    // closes in finally{} — whether the consumer breaks, throws, or
    // the hub shuts down.
    // -----------------------------------------------------------------------

    const subscribeEvents =
      async function* (): AsyncIterableIterator<ServerOutput> {
        const iteratorScope = Effect.runSync(Scope.make());

        const dequeue = await Effect.runPromise(
          PubSub.subscribe(hub).pipe(Scope.extend(iteratorScope)),
        );

        try {
          while (true) {
            const event = await Effect.runPromise(Queue.take(dequeue));
            yield event;
          }
        } finally {
          await Effect.runPromise(Scope.close(iteratorScope, Exit.void));
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
      newTx: newTxEffect,
      close: closeEffect,
      safeClose: safeCloseEffect,
      contest: contestEffect,
      fanout: fanoutEffect,
      awaitReadyToFanout: awaitReadyToFanoutEffect,
      abort: abortEffect,
      decommit: decommitEffect,
      recover: recoverEffect,
      // HTTP queries
      getProtocolParameters: getProtocolParametersEffect,
      getSnapshotUtxo: getSnapshotUtxoEffect,
      getSnapshot: getSnapshotEffect,
      getCommits: getCommitsEffect,
      // HTTP commands
      submitCommit: submitCommitEffect,
      submitTransaction: submitTransactionEffect,
      submitCardanoTransaction: submitCardanoTransactionEffect,
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
      commit: (utxos: unknown) => runEffect(effectApi.commit(utxos)),
      newTx: (transaction: unknown) => runEffect(effectApi.newTx(transaction)),
      close: () => runEffect(effectApi.close()),
      safeClose: () => runEffect(effectApi.safeClose()),
      contest: () => runEffect(effectApi.contest()),
      fanout: () => runEffect(effectApi.fanout()),
      abort: () => runEffect(effectApi.abort()),
      decommit: (decommitTx: unknown) =>
        runEffect(effectApi.decommit(decommitTx)),
      recover: (recoverTxId: unknown) =>
        runEffect(effectApi.recover(recoverTxId)),
      // HTTP queries
      getProtocolParameters: () =>
        Effect.runPromise(effectApi.getProtocolParameters()),
      getSnapshotUtxo: () => Effect.runPromise(effectApi.getSnapshotUtxo()),
      getSnapshot: () => Effect.runPromise(effectApi.getSnapshot()),
      getCommits: () => Effect.runPromise(effectApi.getCommits()),
      // HTTP commands
      submitCommit: (blueprintTx: unknown) =>
        Effect.runPromise(effectApi.submitCommit(blueprintTx)),
      submitTransaction: (tx: unknown) =>
        Effect.runPromise(effectApi.submitTransaction(tx)),
      submitCardanoTransaction: (tx: unknown) =>
        Effect.runPromise(effectApi.submitCardanoTransaction(tx)),
      subscribe,
      subscribeEvents,
      dispose: () => Effect.runPromise(effectApi.dispose()),

      effect: effectApi,
    };

    return handle;
  });

// ---------------------------------------------------------------------------
// Scoped / Layer / convenience
// ---------------------------------------------------------------------------

const createScopedEffect = (config: HeadConfig) =>
  Effect.acquireRelease(createEffect(config), (head) =>
    head.effect.dispose().pipe(Effect.orDie),
  );

export const effect = {
  create: createEffect,
  createScoped: createScopedEffect,
};

export const create = (config: HeadConfig): Promise<HydraHead> =>
  Effect.runPromise(createEffect(config));

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

export class HydraHeadService extends Context.Tag("HydraHeadService")<
  HydraHeadService,
  HydraHead
>() {}

export const layer = (
  config: HeadConfig,
): Layer.Layer<HydraHeadService, HeadError> =>
  Layer.scoped(HydraHeadService, createScopedEffect(config));
