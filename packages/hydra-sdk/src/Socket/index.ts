import { Socket } from "@effect/platform";
import { Effect, PubSub } from "effect";
import { RuntimeFiber } from "effect/Fiber";

type SocketConfig = {

}

enum SocketStatus {
    Connected,
    Disconected
}

// Forward a config to SocketController

export class SocketController extends Effect.Service<SocketController>()("SocketController", {
  effect: Effect.gen(function* () {
    yield* Effect.log(`SocketController was created at: ${url}`);

    const socket : Socket.Socket = yield* Socket.makeWebSocket(url);
    const messageQueue: PubSub.PubSub<Uint8Array<ArrayBufferLike>> =
        yield* PubSub.unbounded<Uint8Array>();

    const socketFiber: RuntimeFiber<void, Socket.SocketError> = yield* Effect.fork(
      socket
        .run((data) => {
          return Effect.gen(function* () {
            yield* Effect.logDebug(`Client Socket message received`);
            return yield* PubSub.publish(messageQueue, data);
          });
        })
        .pipe(
          Effect.tap(() =>
            Effect.logDebug("Client Socket message received and queued"),
          ),
        ),
    );

    return {
      messageQueue,
    };
  }),
}) {}

export const createWebSocketConnection = (url: string) =>
  Effect.gen(function* () {
    yield* Effect.log(`Connecting to WebSocket at: ${url}`);

    // Create the WebSocket
    const socket = yield* Socket.makeWebSocket(url);

    // Create an unbounded queue for messages
    const messages = yield* PubSub.unbounded<Uint8Array>();
    yield* Effect.log("Message queue created");

    socket.writer.pipe()

    /*
     * Start a fiber that continuously processes incoming messages into the pubsub queue
     */


    /**
     * Send data through the WebSocket
     */
    const sendMessage = (chunk: Uint8Array | string | Socket.CloseEvent) =>
      socket.writer.pipe(
        Effect.flatMap((write) => write(chunk)),
        Effect.tapError((e) => Effect.logError(`Failed to send message: ${e}`)),
      );

    return {
      // Access to the message queue for taking messages
      messages,

      // Write to the socket
      sendMessage,

      // Access to the raw socket for advanced usage
      socket,

      // Access to the fiber running the socket
      publishMessageFiber,
    };
  });
