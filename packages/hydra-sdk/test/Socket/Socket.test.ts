import { it, describe } from "@effect/vitest";
import { Effect, Layer, Logger, PubSub } from "effect";
import { WS } from "vitest-websocket-mock";
import { Socket } from "@no-witness-labs/hydra-sdk";
import { Scope } from "effect/Scope";
import { Dequeue } from "effect/Queue";

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

describe("Socket",
  () => {
  it.scoped.only("mock effect server", () =>
    Effect.gen(function* () {
      const server = yield* makeServer;
      const socketController = yield* Socket.SocketController;
      const messageQueue = socketController.messageQueue;

      // Wait a moment for socket to connect
      yield* Effect.sleep("100 millis");

      yield* Effect.logInfo(`messageQueue.size is ${yield* messageQueue.size}`)

      const helloMessage: Uint8Array<ArrayBufferLike> = new TextEncoder().encode("Server hello");

      yield* Effect.logInfo("Sending Hello Message")
      server.send(helloMessage);
      yield* socketController.sendMessage(helloMessage)
      yield* Effect.logInfo("Sent Hello Message")

      yield* Effect.logInfo(server.messages)

      yield* Effect.logInfo(`messageQueue.size is ${yield* messageQueue.size}`)

      const receivedHelloMessage = yield* messageQueue.take
      yield* Effect.logInfo("Received Hello Message")

      expect(helloMessage).toEqual(receivedHelloMessage);

    },).pipe(
      Effect.provide(Socket.SocketController.Default({url})),
      Effect.provide(Logger.pretty),
    ),
  );
});
