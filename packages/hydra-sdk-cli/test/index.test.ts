import { WebSocketConstructor } from "@effect/platform/Socket";
import { describe, it } from "@effect/vitest";
import { Head, Socket, Config } from "@no-witness-labs/hydra-sdk-cli";
import { Effect, Layer, Logger } from "effect";
import { WS } from "vitest-websocket-mock";

const urlNoAppends = "localhost:1234";
const url = "ws://" + urlNoAppends;

class MockServer extends Effect.Service<MockServer>()("MockServer", {
  scoped: Effect.acquireRelease(
    Effect.sync(() => new WS(url)),
    (ws) =>
      Effect.sync(() => {
        ws.close();
        WS.clean();
      }),
  ),
}) {}

const MockWebSocketLayer = Layer.succeed(
  WebSocketConstructor,
  (url, options) => {
    return new WebSocket(url, options) as unknown as globalThis.WebSocket;
  },
);

const TestLayer = Layer.merge(
  MockServer.Default,
  Head.HydraHeadController.Default.pipe(
    Layer.provide(Head.HydraStateMachine.Default),
    Layer.provide(Socket.SocketController.DefaultWithoutDependencies),
    Layer.provide(Config.Config.Default(urlNoAppends)),
    Layer.provide(MockWebSocketLayer),
    Layer.provide(Logger.pretty),
  ),
);

describe("core", () => {
  describe("statusHead", () => {
    it.scoped("does not throw errors", () =>
      Effect.gen(function* () {
        const server = yield* MockServer;
        yield* Effect.promise(() => server.connected);
        const hydraHead = yield* Head.HydraHeadController;

        hydraHead.logStatus;
      }).pipe(Effect.provide(TestLayer)),
    );
  });
});
