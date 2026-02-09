import { it, describe } from "@effect/vitest";
import { Effect, Layer, Logger, PubSub } from "effect";
import { WS } from "vitest-websocket-mock";
import { Socket } from "@no-witness-labs/hydra-sdk";
import { Scope } from "effect/Scope";
import { Dequeue } from "effect/Queue";
import { WebSocketConstructor } from "@effect/platform/Socket";

const url = `ws://localhost:1234`;

const makeServer: Effect.Effect<WS, never, Scope> = Effect.acquireRelease(
  Effect.sync(() => new WS(url)), // acquire
  // release
  (ws) =>
    Effect.sync(() => {
      ws.close();
      WS.clean();
    }),
);

const MockWebSocketLayer = Layer.succeed(
  WebSocketConstructor,
  (url, options) => {
    return new WebSocket(url, options) as unknown as globalThis.WebSocket;
  }
);

describe("Socket",
  () => {
  it.scoped.only("SocketController can send messages", () =>
    Effect.gen(function* () {
      const server = yield* makeServer;
      const socketController = yield* Socket.SocketController;
      // Check that server is connected
      yield* Effect.promise(() => server.connected)

      const message = "Controller hello"

      yield* Effect.logInfo(`Client sending message: ${message}`)
      const encodedMessage: Uint8Array = new TextEncoder().encode(message);
      yield* socketController.sendMessage(encodedMessage)

      const receivedRawMessage = yield* Effect.promise(() => server.nextMessage as Promise<Uint8Array>)
      const receivedMessage = new TextDecoder().decode(receivedRawMessage)
      yield* Effect.logInfo(`Server received message: ${receivedMessage}`)

      expect(message).toEqual(receivedMessage);

    },).pipe(
      Effect.provide(Socket.SocketController.DefaultWithoutDependencies({url})),
      Effect.provide(MockWebSocketLayer),
      Effect.provide(Logger.pretty),
    ),
  ),
    it.scoped.only("SocketController can receive messages", () =>
    Effect.gen(function* () {
      const server = yield* makeServer;
      const socketController = yield* Socket.SocketController;
      // Check that server is connected
      yield* Effect.promise(() => server.connected)

      const message = "Server hello"

      yield* Effect.logInfo(`Server sending message: ${message}`)
      // No need to encode since `server` does it by default:
      server.send(message)

      const receivedRawMessage = yield* socketController.messageQueue.take
      const receivedMessage = new TextDecoder().decode(receivedRawMessage)
      yield* Effect.logInfo(`Client received message: ${receivedMessage}`)

      expect(message).toEqual(receivedMessage);

    },).pipe(
      Effect.provide(Socket.SocketController.DefaultWithoutDependencies({url})),
      Effect.provide(MockWebSocketLayer),
      Effect.provide(Logger.pretty),
    ),
  )
});

