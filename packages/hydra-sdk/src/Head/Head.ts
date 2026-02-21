import { Context, Data, Effect, Fiber, Layer, Queue, Stream } from "effect";

import { makeHeadFsm } from "./Head.fsm.js";
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
    events(): Stream.Stream<ServerOutput, HeadError>;
    dispose(): Effect.Effect<void, HeadError>;
  };
}

interface HydraHeadEffectApi {
  readonly init: (params?: InitParams) => Effect.Effect<void, HeadError>;
  // TODO(protocol-schema): replace unknown with protocol Transaction type.
  // Commit is REST-driven in Hydra and this scaffold signature is temporary.
  readonly commit: (utxos: unknown) => Effect.Effect<void, HeadError>;
  readonly close: () => Effect.Effect<void, HeadError>;
  readonly safeClose: () => Effect.Effect<void, HeadError>;
  readonly fanout: () => Effect.Effect<void, HeadError>;
  readonly awaitReadyToFanout: () => Effect.Effect<void, HeadError>;
  readonly abort: () => Effect.Effect<void, HeadError>;
  readonly events: () => Stream.Stream<ServerOutput, HeadError>;
  readonly dispose: () => Effect.Effect<void, HeadError>;
}

const transitionEventTag: Record<HeadStatus, string> = {
  Idle: "HeadIsIdle",
  Initializing: "HeadIsInitializing",
  Open: "HeadIsOpen",
  Closed: "HeadIsClosed",
  FanoutPossible: "ReadyToFanout",
  Final: "HeadIsFinalized",
  Aborted: "HeadIsAborted",
};

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

const createEffect = (
  config: HeadConfig,
): Effect.Effect<HydraHead, HeadError> =>
  Effect.gen(function* () {
    const transport = yield* makeHeadTransport(config);
    const router = yield* makeCommandRouter(transport);
    const fsm = yield* makeHeadFsm();
    const callbackSubscribers = new Set<(event: ServerOutput) => void>();
    const iteratorSubscribers = new Set<Queue.Enqueue<ServerOutput>>();
    const streamQueue = yield* Queue.unbounded<ServerOutput>();

    let state: HeadStatus = "Idle";
    let headId: string | null = null;

    const { queue: projected, unsubscribe: unsubscribeProjected } =
      yield* transport.events.subscribe;
    const projectorFiber = yield* Effect.forkDaemon(
      Effect.forever(
        Queue.take(projected).pipe(
          Effect.flatMap((event) => {
            if (isServerOutput(event)) {
              const next = Object.entries(transitionEventTag).find(
                ([, tag]) => tag === event.output.tag,
              );
              if (next) {
                state = next[0] as HeadStatus;
              }

              return Effect.zipRight(
                fsm.applyOutputTag(event.output.tag),
                Effect.sync(() => {
                  for (const callback of callbackSubscribers) {
                    callback(event.output);
                  }
                }).pipe(
                  Effect.zipRight(
                    Effect.zipRight(
                      Queue.offer(streamQueue, event.output).pipe(
                        Effect.asVoid,
                      ),
                      Effect.forEach(iteratorSubscribers, (queue) =>
                        Queue.offer(queue, event.output),
                      ).pipe(Effect.asVoid),
                    ),
                  ),
                ),
              );
            }

            if (event._tag === "Greetings") {
              state = event.greetings.headStatus;
              return fsm.applyOutputTag(
                transitionEventTag[event.greetings.headStatus],
              );
            }

            return Effect.void;
          }),
          Effect.catchAll((error) =>
            Effect.logError("Head projector loop failed").pipe(
              Effect.zipRight(Effect.logError(error)),
              Effect.asVoid,
            ),
          ),
        ),
      ),
    );

    const execute = (
      command: ClientInputTag,
      payload: unknown,
      matcher: (event: ApiEvent) => MatchResult<void>,
      timeoutMs: number,
    ): Effect.Effect<void, HeadError> =>
      Effect.gen(function* () {
        yield* fsm.assertCommandAllowed(command);
        yield* router.sendAndAwait(
          transport.send(command, payload),
          matcher,
          timeoutMs,
        );
      });

    const initEffect = (params?: InitParams): Effect.Effect<void, HeadError> =>
      execute(
        "Init",
        params,
        (event) => matchServerTag(event, "HeadIsInitializing", "Init"),
        30_000,
      ).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            // TODO(protocol-schema): extract headId from HeadIsInitializing payload.
            headId = "dummy-head-id";
          }),
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
        if (state === "Final") {
          return yield* Effect.fail(
            new HeadError({
              message: "Fanout is not allowed when head is already Final",
            }),
          );
        }

        if (state === "FanoutPossible") {
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

    const disposeEffect = (): Effect.Effect<void, HeadError> =>
      Effect.gen(function* () {
        yield* Fiber.interrupt(projectorFiber);
        yield* unsubscribeProjected;
        yield* Queue.shutdown(projected).pipe(Effect.orDie);
        yield* Effect.forEach(iteratorSubscribers, (queue) =>
          Queue.shutdown(queue).pipe(Effect.orDie),
        ).pipe(Effect.asVoid);
        yield* Queue.shutdown(streamQueue).pipe(Effect.orDie);
        iteratorSubscribers.clear();
        callbackSubscribers.clear();
        yield* transport.dispose;
        state = "Idle";
        headId = null;
      });

    const subscribe = (
      callback: (event: ServerOutput) => void,
    ): Unsubscribe => {
      callbackSubscribers.add(callback);

      let cancelled = false;

      return () => {
        if (cancelled) {
          return;
        }

        cancelled = true;
        callbackSubscribers.delete(callback);
      };
    };

    const subscribeEvents =
      async function* (): AsyncIterableIterator<ServerOutput> {
        const queue = await Effect.runPromise(Queue.unbounded<ServerOutput>());
        iteratorSubscribers.add(queue);
        try {
          while (true) {
            const event = await Effect.runPromise(Queue.take(queue));
            yield event;
          }
        } finally {
          iteratorSubscribers.delete(queue);
          await Effect.runPromise(Queue.shutdown(queue).pipe(Effect.orDie));
        }
      };

    const effectApi: HydraHeadEffectApi = {
      init: initEffect,
      commit: commitEffect,
      close: closeEffect,
      safeClose: safeCloseEffect,
      fanout: fanoutEffect,
      awaitReadyToFanout: awaitReadyToFanoutEffect,
      abort: abortEffect,
      events: () => Stream.fromQueue(streamQueue),
      dispose: disposeEffect,
    };

    const runEffectPromise = <A>(
      operation: Effect.Effect<A, HeadError>,
    ): Promise<A> => Effect.runPromise(operation);

    const handle: HydraHead = {
      get state() {
        return state;
      },
      get headId() {
        return headId;
      },

      getState: () => state,

      init: (params?: InitParams) => runEffectPromise(effectApi.init(params)),
      commit: (utxos: unknown) => runEffectPromise(effectApi.commit(utxos)),
      close: () => runEffectPromise(effectApi.close()),
      safeClose: () => runEffectPromise(effectApi.safeClose()),
      fanout: () => runEffectPromise(effectApi.fanout()),
      abort: () => runEffectPromise(effectApi.abort()),
      subscribe,
      subscribeEvents,
      dispose: () => runEffectPromise(effectApi.dispose()),

      effect: effectApi,
    };

    return handle;
  });

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
