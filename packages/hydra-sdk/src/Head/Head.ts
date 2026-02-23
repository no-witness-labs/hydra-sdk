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
  | "Close"
  // TODO(protocol-schema): SafeClose is scaffold-only and not part of Hydra websocket commands.
  | "SafeClose"
  | "Fanout"
  | "Abort";

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
  close(): Promise<void>;
  safeClose(): Promise<void>;
  fanout(): Promise<void>;
  abort(): Promise<void>;
  subscribe(callback: (event: ServerOutput) => void): Unsubscribe;
  subscribeEvents(): AsyncIterableIterator<ServerOutput>;
  dispose(): Promise<void>;

  readonly effect: {
    init(params?: InitParams): Effect.Effect<void, HeadError>;
    // TODO(protocol-schema): replace unknown with protocol Transaction type.
    // Commit is REST-driven in Hydra and this scaffold signature is temporary.
    commit(utxos: unknown): Effect.Effect<void, HeadError>;
    close(): Effect.Effect<void, HeadError>;
    safeClose(): Effect.Effect<void, HeadError>;
    fanout(): Effect.Effect<void, HeadError>;
    awaitReadyToFanout(): Effect.Effect<void, HeadError>;
    abort(): Effect.Effect<void, HeadError>;
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
    const router = yield* makeCommandRouter(transport);
    const fsm = yield* makeHeadFsm();

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
              // On reconnect/greeting, force-sync FSM to the server's state.
              // Use the output tag so applyOutputTag can validate/log if needed.
              const tag = outputTagFromStatus(event.greetings.headStatus);
              return tag !== undefined
                ? fsm.applyOutputTag(tag)
                : Ref.set(fsm.status, event.greetings.headStatus);
            }

            return Effect.void;
          }),
        ),
      ),
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
          await Effect.runPromise(
            Scope.close(scope, Exit.void),
          );
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
      close: () => runEffect(effectApi.close()),
      safeClose: () => runEffect(effectApi.safeClose()),
      fanout: () => runEffect(effectApi.fanout()),
      abort: () => runEffect(effectApi.abort()),
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
