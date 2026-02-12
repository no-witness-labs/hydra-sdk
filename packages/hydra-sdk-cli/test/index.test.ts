import { WebSocketConstructor } from "@effect/platform/Socket";
import { describe, it } from "@effect/vitest";
import { Head, Socket } from "@no-witness-labs/hydra-sdk-cli";
import { statusHead } from "@no-witness-labs/hydra-sdk-cli";
import { Effect, Layer, Logger } from "effect";
import type { Scope } from "effect/Scope";
import { WS } from "vitest-websocket-mock";

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
  },
);

describe("core", () => {
  describe("statusHead", () => {
    it.scoped("does not throw errors", () =>
      Effect.gen(function* () {
        const server = yield* makeServer;
        yield* Effect.promise(() => server.connected);

        yield* statusHead;
      }).pipe(
        Effect.provide(Head.HydraStateMachine.DefaultWithoutDependencies),
        Effect.provide(
          Socket.SocketController.DefaultWithoutDependencies({ url }),
        ),
        Effect.provide(MockWebSocketLayer),
        Effect.provide(Logger.pretty),
      ),
    );
  });
});
