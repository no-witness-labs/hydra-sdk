import { Deferred, Effect, Fiber, Queue } from "effect";

import { type ApiEvent, HeadError } from "./Head.js";
import { type HeadTransport } from "./Head.transport.js";

type MatchContinue = { readonly _tag: "continue" };
type MatchSuccess<A> = { readonly _tag: "success"; readonly value: A };
type MatchFailure = { readonly _tag: "failure"; readonly error: HeadError };

export type MatchResult<A> = MatchContinue | MatchSuccess<A> | MatchFailure;

export interface CommandRouter {
  readonly sendAndAwait: <A>(
    start: Effect.Effect<void, HeadError>,
    matcher: (event: ApiEvent) => MatchResult<A>,
    timeoutMs: number,
  ) => Effect.Effect<A, HeadError>;
  readonly awaitMatch: <A>(
    matcher: (event: ApiEvent) => MatchResult<A>,
    timeoutMs: number,
  ) => Effect.Effect<A, HeadError>;
}

const Continue: MatchContinue = { _tag: "continue" };

export const matchContinue = <A>(): MatchResult<A> => Continue;

export const matchSuccess = <A>(value: A): MatchResult<A> => ({
  _tag: "success",
  value,
});

export const matchFailure = (error: HeadError): MatchResult<never> => ({
  _tag: "failure",
  error,
});

export const makeCommandRouter = (
  transport: HeadTransport,
): Effect.Effect<CommandRouter> =>
  Effect.gen(function* () {
    const runAwait = <A>(
      start: Effect.Effect<void, HeadError>,
      matcher: (event: ApiEvent) => MatchResult<A>,
      timeoutMs: number,
    ): Effect.Effect<A, HeadError> =>
      Effect.gen(function* () {
        const queue = yield* Queue.unbounded<ApiEvent>();
        const { queue: sub, unsubscribe } = yield* transport.events.subscribe;

        const pump = Effect.forever(
          Queue.take(sub).pipe(
            Effect.flatMap((event) => Queue.offer(queue, event)),
            Effect.asVoid,
          ),
        );

        const pumpFiber = yield* Effect.forkDaemon(pump);
        const done = yield* Deferred.make<A, HeadError>();

        const consume = Effect.forever(
          Queue.take(queue).pipe(
            Effect.flatMap((event) => {
              const result = matcher(event);
              switch (result._tag) {
                case "continue":
                  return Effect.void;
                case "success":
                  return Deferred.succeed(done, result.value);
                case "failure":
                  return Deferred.fail(done, result.error);
              }
            }),
          ),
        );

        const consumeFiber = yield* Effect.forkDaemon(consume);

        yield* start;

        const awaitResult = Deferred.await(done).pipe(
          Effect.timeoutFail({
            duration: timeoutMs,
            onTimeout: () =>
              new HeadError({
                message: `Command timed out after ${timeoutMs}ms`,
              }),
          }),
        );

        const result = yield* awaitResult.pipe(
          Effect.ensuring(
            Effect.zipRight(
              fiberInterruptAll([pumpFiber, consumeFiber]),
              Effect.zipRight(
                unsubscribe,
                Queue.shutdown(queue).pipe(Effect.orDie),
              ),
            ),
          ),
        );

        return result;
      });

    const awaitMatch = <A>(
      matcher: (event: ApiEvent) => MatchResult<A>,
      timeoutMs: number,
    ): Effect.Effect<A, HeadError> => runAwait(Effect.void, matcher, timeoutMs);

    const sendAndAwait = <A>(
      start: Effect.Effect<void, HeadError>,
      matcher: (event: ApiEvent) => MatchResult<A>,
      timeoutMs: number,
    ): Effect.Effect<A, HeadError> => runAwait(start, matcher, timeoutMs);

    return {
      sendAndAwait,
      awaitMatch,
    };
  });

const fiberInterruptAll = (
  fibers: Array<Fiber.RuntimeFiber<unknown, unknown>>,
): Effect.Effect<void> =>
  Effect.forEach(fibers, (fiber) => Fiber.interrupt(fiber)).pipe(Effect.asVoid);
