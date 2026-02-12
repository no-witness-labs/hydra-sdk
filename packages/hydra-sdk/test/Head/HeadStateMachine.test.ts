import { WebSocketConstructor } from "@effect/platform/Socket";
import { describe, it, expect } from "@effect/vitest";
import { Socket, Protocol, Head } from "@no-witness-labs/hydra-sdk";
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

describe("Head.HydraStateMachine", () => {
  it.scoped("initializes with DISCONNECTED status", () =>
    Effect.gen(function* () {
      const server = yield* makeServer;
      yield* Effect.promise(() => server.connected);

      const stateMachine = yield* Head.HydraStateMachine;

      const status: Protocol.Status = stateMachine.getStatus();
      expect(status).toEqual("DISCONNECTED");
    }).pipe(
      Effect.provide(Head.HydraStateMachine.DefaultWithoutDependencies),
      Effect.provide(
        Socket.SocketController.DefaultWithoutDependencies({ url }),
      ),
      Effect.provide(MockWebSocketLayer),
      Effect.provide(Logger.pretty),
    ),
  );

  it.scoped("updates status when receiving valid status messages", () =>
    Effect.gen(function* () {
      const server = yield* makeServer;
      yield* Effect.promise(() => server.connected);

      const stateMachine = yield* Head.HydraStateMachine;

      const statusMessage = JSON.stringify({
        me: {
          vkey: "41c3b71ac178ba33e59506a792679d5cdd6efe9a1f474a53f13f7dde16b35eb6",
        },
        headStatus: "Idle",
        hydraNodeVersion: "1.0.0",
      });

      yield* Effect.logInfo(`Server sending status message: ${statusMessage}`);
      server.send(statusMessage);

      // Await for the eventual change of the status (sleep is not reliable)
      const status = yield* Effect.eventually(
        Effect.suspend(() => {
          const s = stateMachine.getStatus();
          return s !== "DISCONNECTED"
            ? Effect.succeed(s)
            : Effect.fail("not ready");
        }),
      );
      yield* Effect.logInfo(`Status after message: ${status}`);
      expect(status).toEqual("IDLE");
    }).pipe(
      Effect.provide(Head.HydraStateMachine.DefaultWithoutDependencies),
      Effect.provide(
        Socket.SocketController.DefaultWithoutDependencies({ url }),
      ),
      Effect.provide(MockWebSocketLayer),
      Effect.provide(Logger.pretty),
    ),
  );

  it.scoped("ignores invalid messages", () =>
    Effect.gen(function* () {
      const server = yield* makeServer;
      yield* Effect.promise(() => server.connected);

      const stateMachine = yield* Head.HydraStateMachine;

      const initialStatus = stateMachine.getStatus();

      const invalidMessage = JSON.stringify({ invalid: "data" });
      yield* Effect.logInfo(
        `Server sending invalid message: ${invalidMessage}`,
      );
      server.send(invalidMessage);

      yield* Effect.yieldNow();
      const statusAfter = stateMachine.getStatus();

      // Status should remain unchanged
      expect(statusAfter).toEqual(initialStatus);
    }).pipe(
      Effect.provide(Head.HydraStateMachine.DefaultWithoutDependencies),
      Effect.provide(
        Socket.SocketController.DefaultWithoutDependencies({ url }),
      ),
      Effect.provide(MockWebSocketLayer),
      Effect.provide(Logger.pretty),
    ),
  );

  it.scoped("processes multiple status updates in sequence", () =>
    Effect.gen(function* () {
      const server = yield* makeServer;
      yield* Effect.promise(() => server.connected);

      const stateMachine = yield* Head.HydraStateMachine;

      // Send first status message
      const message1 = JSON.stringify({
        me: {
          vkey: "41c3b71ac178ba33e59506a792679d5cdd6efe9a1f474a53f13f7dde16b35eb6",
        },
        headStatus: "Idle",
        hydraNodeVersion: "1.0.0",
      });
      server.send(message1);

      // Await for the eventual change of the status (sleep is not reliable)
      const status1 = yield* Effect.eventually(
        Effect.suspend(() => {
          const s = stateMachine.getStatus();
          return s !== "DISCONNECTED"
            ? Effect.succeed(s)
            : Effect.fail("not ready");
        }),
      );
      yield* Effect.logInfo(`Status after first message: ${status1}`);

      // Send second status message
      const message2 = JSON.stringify({
        tag: "HeadIsInitializing",
        headId: "820082582089ff4f3ff4a6052ec9d073",
        parties: [
          {
            vkey: "d0b8f28427aa7b640c636075905cbd6574a431aeaca5b3dbafd47cfe66c35043",
          },
        ],
        seq: 1,
        timestamp: "2019-08-24T14:15:22.000Z",
      });
      server.send(message2);

      yield* Effect.yieldNow();
      const status2 = yield* Effect.eventually(
        Effect.suspend(() => {
          const s = stateMachine.getStatus();
          return s !== status1 ? Effect.succeed(s) : Effect.fail("not ready");
        }),
      );
      yield* Effect.logInfo(`Status after second message: ${status2}`);

      // Verify status changed
      expect(status2).not.toEqual(status1);
    }).pipe(
      Effect.provide(Head.HydraStateMachine.DefaultWithoutDependencies),
      Effect.provide(
        Socket.SocketController.DefaultWithoutDependencies({ url }),
      ),
      Effect.provide(MockWebSocketLayer),
      Effect.provide(Logger.pretty),
    ),
  );

  it.scoped("statusFiber continues processing messages", () =>
    Effect.gen(function* () {
      const server = yield* makeServer;
      yield* Effect.promise(() => server.connected);

      const stateMachine = yield* Head.HydraStateMachine;

      // Verify the fiber is running
      const fiberStatus = yield* Effect.sync(() =>
        stateMachine.statusFiber.unsafePoll(),
      );
      expect(fiberStatus).toBeNull(); // Fiber is still running (not completed)

      // Send multiple messages and verify they're all processed
      for (let i = 0; i < 3; i++) {
        const message = JSON.stringify({
          me: {
            vkey: "41c3b71ac178ba33e59506a792679d5cdd6efe9a1f474a53f13f7dde16b35eb6",
          },
          headStatus: "Idle",
          hydraNodeVersion: "1.0.0",
        });
        server.send(message);
        yield* Effect.yieldNow();
      }

      // Fiber should still be running
      const fiberStatusAfter = yield* Effect.sync(() =>
        stateMachine.statusFiber.unsafePoll(),
      );
      expect(fiberStatusAfter).toBeNull();
    }).pipe(
      Effect.provide(Head.HydraStateMachine.DefaultWithoutDependencies),
      Effect.provide(
        Socket.SocketController.DefaultWithoutDependencies({ url }),
      ),
      Effect.provide(MockWebSocketLayer),
      Effect.provide(Logger.pretty),
    ),
  );

  it.scoped("handles non-JSON messages gracefully", () =>
    Effect.gen(function* () {
      const server = yield* makeServer;
      yield* Effect.promise(() => server.connected);

      const stateMachine = yield* Head.HydraStateMachine;

      const initialStatus = stateMachine.getStatus();

      // Send a non-JSON message
      server.send("not valid json at all");

      yield* Effect.yieldNow();

      const statusAfter = stateMachine.getStatus();

      // Status should remain unchanged
      expect(statusAfter).toEqual(initialStatus);
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
