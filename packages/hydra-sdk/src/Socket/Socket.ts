import { Socket } from "@effect/platform";
import { WebSocketConstructor } from "@effect/platform/Socket";
import { Effect, Fiber, Layer, Queue, Schedule } from "effect";
import { RuntimeFiber } from "effect/Fiber";
import { WebSocket } from "ws";

// =============================================================================
// Socket Configuration
// =============================================================================

/**
 * Configuration for establishing a WebSocket connection.
 *
 * @since 0.2.0
 * @category types
 */
type SocketConfig = {
  /**
   * The WebSocket URL to connect to.
   */
  url: string;
};

// =============================================================================
// Socket Controller Service
// =============================================================================

/**
 * A service that manages WebSocket connections with automatic reconnection
 * and message queuing capabilities.
 *
 * The SocketController provides:
 * - Automatic connection management with exponential backoff retry logic
 * - Message queuing for incoming WebSocket messages
 * - Methods to send messages and close the connection
 * - Comprehensive logging for connection lifecycle events
 *
 * @since 0.2.0
 * @category services
 * @example
 * ```typescript
 * import { Effect, Layer } from "effect";
 * import { SocketController } from "./Socket";
 *
 * const program = Effect.gen(function* () {
 *   const socket = yield* SocketController;
 *   yield* socket.sendMessage("Hello, Hydra!");
 *   const message = yield* Queue.take(socket.messageQueue);
 *   // Process message...
 * });
 *
 * Effect.runPromise(
 *   program.pipe(
 *     Effect.provide(
 *       SocketController.Default({ url: "ws://localhost:4001" })
 *     )
 *   )
 * );
 * ```
 */
export class SocketController extends Effect.Service<SocketController>()(
  "SocketController",
  {
    effect: ({ url }: SocketConfig) =>
      Effect.gen(function* () {
        yield* Effect.log(`SocketController was created at: ${url}`);

        const socket: Socket.Socket = yield* Socket.makeWebSocket(url);
        const messageQueue: Queue.Queue<Uint8Array> = yield* Queue.unbounded<Uint8Array>();

        const retryPolicy = Schedule.intersect(
          Schedule.exponential("100 millis"),
          Schedule.recurs(20),
        );

        const socketConnection = socket.run((data) => {
          return Queue.offer(messageQueue, data);
        }, {
          onOpen: Effect.logInfo("Socket connected successfully")
        }).pipe(
            Effect.tap(Effect.logInfo(`Socket message received`)),
            Effect.tapError((e) => Effect.logInfo(`Socket error received: ${e}`)),
            Effect.tapDefect((d) => Effect.logInfo(`Socket defect received: ${d}`)),
            Effect.forever
        );

        const socketFiber: RuntimeFiber<void, Socket.SocketError> =
            yield* Effect.fork(
                Effect.retry(socketConnection, retryPolicy)
            )

        /**
         * Send a message through the WebSocket connection.
         *
         * @param chunk - The message to send, either as a string or binary data
         * @returns An effect that sends the message and handles errors
         *
         * @since 0.2.0
         * @category methods
         */
        const sendMessage = (chunk: string | Uint8Array) =>
          Effect.scoped(
            socket.writer.pipe(
              Effect.flatMap((write) => write(chunk)),
              Effect.tapError((e) =>
                Effect.logInfo(`Failed to send message: ${e}`),
              ),
            ),
          );

        const sendClose = () =>
          Effect.scoped(
            socket.writer.pipe(
              Effect.flatMap((write) => write(new Socket.CloseEvent())),
            ),
          );

        return {
          /**
           * Queue containing incoming WebSocket messages.
           * Messages are enqueued as they arrive and can be consumed using Queue operations.
           *
           * @since 0.2.0
           */
          messageQueue,
          /**
           * Fiber managing the WebSocket connection lifecycle.
           *
           * @since 0.2.0
           */
          socketFiber,
          /**
           * Send a message through the WebSocket.
           *
           * @since 0.2.0
           */
          sendMessage,
          /**
           * Send a close the WebSocket connection message.
           *
           * @since 0.2.0
           */
          sendClose,
        };
      }),
    dependencies: [
      /**
       * WebSocket constructor dependency injection.
       * Uses the 'ws' library WebSocket implementation for Node.js environments.
       *
       * @since 0.2.0
       */
      Layer.succeed(WebSocketConstructor, (url, options) => {
        return new WebSocket(url, options) as unknown as globalThis.WebSocket;
      }),
    ]
  },
) {}
