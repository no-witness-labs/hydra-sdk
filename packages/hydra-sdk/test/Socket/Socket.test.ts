import { WebSocketConstructor } from "@effect/platform/Socket";
import { describe, it } from "@effect/vitest";
import { Config, Socket } from "@no-witness-labs/hydra-sdk";
import { Effect, Layer, Logger } from "effect";
import type { Scope } from "effect/Scope";
import { WS } from "vitest-websocket-mock";

const urlNoAppends = "localhost:1234"
const url = "ws://" + urlNoAppends

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
  },
);

const TestLayer = Socket.SocketController.DefaultWithoutDependencies.pipe(
  Layer.provide(Config.Config.Default(urlNoAppends)),
  Layer.provide(MockWebSocketLayer),
  Layer.provide(Logger.pretty),
);

describe("Socket", () => {
  it.scoped("SocketController can send messages", () =>
    Effect.gen(function* () {
      const server = yield* makeServer;
      const socketController = yield* Socket.SocketController;
      // Check that server is connected
      yield* Effect.promise(() => server.connected);

      const message = "Controller hello";

      yield* Effect.logInfo(`Client sending message: ${message}`);
      const encodedMessage: Uint8Array = new TextEncoder().encode(message);
      yield* socketController.sendMessage(encodedMessage);

      const receivedRawMessage = yield* Effect.promise(
        () => server.nextMessage as Promise<Uint8Array>,
      );
      const receivedMessage = new TextDecoder().decode(receivedRawMessage);
      yield* Effect.logInfo(`Server received message: ${receivedMessage}`);

      expect(message).toEqual(receivedMessage);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.scoped("SocketController can receive messages", () =>
    Effect.gen(function* () {
      const server = yield* makeServer;
      const socketController = yield* Socket.SocketController;
      const messageQueue = yield* socketController.messageQueue.subscribe;

      // Check that server is connected
      yield* Effect.promise(() => server.connected);

      const message = "Server hello";

      yield* Effect.logInfo(`Server sending message: ${message}`);
      // No need to encode since `server` does it by default:
      server.send(message);

      const receivedRawMessage = yield* messageQueue.take;
      const receivedMessage = new TextDecoder().decode(receivedRawMessage);
      yield* Effect.logInfo(`Client received message: ${receivedMessage}`);

      expect(message).toEqual(receivedMessage);
    }).pipe(Effect.provide(TestLayer)),
  );
});
