import { Protocol, Socket } from "@no-witness-labs/hydra-sdk";
import { Duration, Effect, Option, Schedule, Schema } from "effect";

const url = "ws://localhost:4001";

/**
 * Error thrown when awaiting a status times out.
 *
 * @since 0.3.0
 * @category errors
 */
export class StatusTimeoutError {
  readonly _tag = "StatusTimeoutError";
  constructor(
    readonly expectedStatus: Protocol.Status,
    readonly currentStatus: Protocol.Status,
  ) {}
}

// =============================================================================
// Hydra State Machine Service
// =============================================================================

/**
 * A service that manages the Hydra head protocol state machine by monitoring
 * WebSocket messages and tracking status transitions.
 *
 * Provides real-time status tracking with automatic message parsing,
 * validation, and comprehensive logging for state transitions.
 *
 * @since 0.3.0
 * @category services
 * @example
 * ```typescript
 * import { Effect } from "effect";
 * import { Head } from "@no-witness-labs/hydra-sdk";
 *
 * const program = Effect.gen(function* () {
 *   const stateMachine = yield* Head.HydraStateMachine;
 *   const currentStatus = stateMachine.getStatus();
 *   console.log(`Hydra head status: ${currentStatus}`);
 * });
 *
 * Effect.runPromise(
 *   program.pipe(
 *     Effect.provide(Head.HydraStateMachine.Default)
 *   )
 * );
 * ```
 */
export class HydraStateMachine extends Effect.Service<HydraStateMachine>()(
  "HydraStateMachine",
  {
    effect: Effect.gen(function* () {
      yield* Effect.log("HydraStateMachine was created");

      const socketController = yield* Socket.SocketController;
      const messageQueue = yield* socketController.messageQueue.subscribe;
      let status: Protocol.Status = "DISCONNECTED";

      const statusFiber = yield* Effect.fork(
        Effect.gen(function* () {
          let rawMessage: Uint8Array;
          while ((rawMessage = yield* messageQueue.take)) {
            const messageText: string = new TextDecoder().decode(rawMessage);

            const maybeStatus: Option.Option<Protocol.Status> =
              yield* Effect.option(
                Schema.decode(
                  Schema.parseJson(Protocol.WebSocketResponseMessageSchema),
                )(messageText),
              ).pipe(
                Effect.map(Option.flatMap(Protocol.socketMessageToStatus)),
              );

            if (Option.isSome(maybeStatus)) {
              const newStatus = yield* maybeStatus;
              yield* Effect.log(
                `Valid status received [${newStatus}] from message: ${messageText}`,
              );
              status = newStatus;
            }
          }
        }),
      );

      const awaitStatus = (
        expectedStatus: Protocol.Status,
        attempts: number = 300,
        sleepDuration: Duration.DurationInput = Duration.millis(100),
      ): Effect.Effect<void, StatusTimeoutError> => {
        const retry = (
          attempts: number,
        ): Effect.Effect<void, StatusTimeoutError> =>
          Effect.suspend(() => {
            if (status === expectedStatus) {
              return Effect.void;
            }

            if (attempts <= 0) {
              return Effect.fail(
                new StatusTimeoutError(expectedStatus, status),
              );
            }

            return Effect.sleep(sleepDuration).pipe(
              Effect.flatMap(() => retry(attempts - 1)),
            );
          });

        return retry(attempts);
      };

      return {
        /**
         * Fiber managing the status monitoring lifecycle.
         *
         * @since 0.3.0
         */
        statusFiber,
        /**
         * Retrieve the current Hydra head protocol status.
         *
         * @since 0.3.0
         * @category methods
         */
        getStatus: () => status,
        /**
         * Wait for a specific status within a given duration.
         *
         * @since 0.3.0
         * @category methods
         */
        awaitStatus
      };
    }),

    dependencies: [Socket.SocketController.Default({ url })],
  },
) {}
