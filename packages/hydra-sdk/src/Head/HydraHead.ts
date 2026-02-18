import { FetchHttpClient, HttpClient } from "@effect/platform";
import { Protocol, Socket, Head } from "@no-witness-labs/hydra-sdk";
import { Effect, Option, Schedule, Schema } from "effect";

// const url = "ws://localhost:4001";
const url = "ws://172.16.238.10:4001";

export class HydraHeadController extends Effect.Service<HydraHeadController>()(
  "HydraHeadController",
  {
    effect: Effect.gen(function* () {
      yield* Effect.log("HydraHeadController was created");

      const httpClient = yield* HttpClient.HttpClient;
      const socketController = yield* Socket.SocketController;
      const hydraStateMachine = yield* Head.HydraStateMachine

      const logStatusHeadForewer = Effect.gen(function* () {
        yield* Effect.logInfo(`The status is: [${hydraStateMachine.getStatus()}]`);
      }).pipe(
        Effect.repeat(Schedule.linear("1 second")),
      );

      const initialize = Effect.gen(function* () {
        yield* Effect.log(`Called initialize`);

        yield* Effect.log(`Awaiting [IDLE] status`);
        hydraStateMachine.awaitStatus("IDLE")

        yield* Effect.log(`Sending "Init" message`);
        yield* socketController.sendMessage(JSON.stringify({ tag: "Init" }))

        yield* Effect.log(`Awaiting [INITIALIZING] status`);
        hydraStateMachine.awaitStatus("INITIALIZING")

        yield* Effect.log(`Initialization complete, status is now ${[hydraStateMachine.getStatus()]}`);
      });

      const commit = Effect.gen(function* () {
        yield* Effect.log(`Called commit`);

        yield* Effect.log(`Awaiting [IDLE] status`);
        hydraStateMachine.awaitStatus("IDLE")

        yield* Effect.log(`Sending "Init" message`);
        yield* socketController.sendMessage(JSON.stringify({ tag: "Init" }))

        yield* Effect.log(`Awaiting [INITIALIZING] status`);
        hydraStateMachine.awaitStatus("INITIALIZING")

        yield* Effect.log(`Initialization complete, status is now ${[hydraStateMachine.getStatus()]}`);
      });

      const close = Effect.gen(function* () {
        yield* Effect.log(`Called close`);

        yield* Effect.log(`Awaiting [IDLE] status`);
        hydraStateMachine.awaitStatus("IDLE")

        yield* Effect.log(`Sending "Init" message`);
        yield* socketController.sendMessage(JSON.stringify({ tag: "Init" }))

        yield* Effect.log(`Awaiting [INITIALIZING] status`);
        hydraStateMachine.awaitStatus("INITIALIZING")

        yield* Effect.log(`Initialization complete, status is now ${[hydraStateMachine.getStatus()]}`);
      });

      const fanout = Effect.gen(function* () {
        yield* Effect.log(`Called fanout`);

        yield* Effect.log(`Awaiting [IDLE] status`);
        hydraStateMachine.awaitStatus("IDLE")

        yield* Effect.log(`Sending "Init" message`);
        yield* socketController.sendMessage(JSON.stringify({ tag: "Init" }))

        yield* Effect.log(`Awaiting [INITIALIZING] status`);
        hydraStateMachine.awaitStatus("INITIALIZING")

        yield* Effect.log(`Initialization complete, status is now ${[hydraStateMachine.getStatus()]}`);
      });

      const abort = Effect.gen(function* () {
        yield* Effect.log(`Called abort`);

        yield* Effect.log(`Awaiting [IDLE] status`);
        hydraStateMachine.awaitStatus("IDLE")

        yield* Effect.log(`Sending "Init" message`);
        yield* socketController.sendMessage(JSON.stringify({ tag: "Init" }))

        yield* Effect.log(`Awaiting [INITIALIZING] status`);
        hydraStateMachine.awaitStatus("INITIALIZING")

        yield* Effect.log(`Initialization complete, status is now ${[hydraStateMachine.getStatus()]}`);
      });

      return {
        logStatusHeadForewer,
        initialize
      };
    }),

    dependencies: [
      FetchHttpClient.layer,
      Head.HydraStateMachine.Default,
      Socket.SocketController.Default({ url })
    ],
  },
) {}
