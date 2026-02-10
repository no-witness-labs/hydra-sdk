import {
  Effect,
  pipe,
  PubSub,
  Option,
  Schema,
} from "effect";
import { Socket, socketMessageToStatus } from "@no-witness-labs/hydra-sdk";
import { WebSocketResponseMessageSchema, Status } from "@no-witness-labs/hydra-sdk"
import {
  FetchHttpClient,
} from "@effect/platform";

const url = "ws://localhost:4001"

export class HydraStateMachine extends Effect.Service<HydraStateMachine>()("HydraStateMachine", {
  effect: Effect.gen(function* () {
    yield* Effect.log("HydraStateMachine was created");

    const socketController = yield* Socket.SocketController

    let status: Status = "DISCONNECTED";

    const statusFiber = yield* Effect.fork(
      Effect.gen(function* () {
        let rawMessage: Uint8Array;
        while ((rawMessage = yield* socketController.messageQueue.take)) {
          const messageText: string = new TextDecoder().decode(rawMessage);
          const maybeStatus: Option.Option<Status> =
              yield* Effect.option(
                Schema.decode(Schema.parseJson(WebSocketResponseMessageSchema))(messageText),
              ).pipe(
                Effect.map(Option.flatMap(socketMessageToStatus)),
              )


          if (Option.isSome(maybeStatus)) {
            const statusRaw = yield* maybeStatus;
            yield* Effect.log(
              `Valid status received [${statusRaw}] from message: ${messageText}`,
            );
            status = statusRaw;
          }
        }
      }),
    );

    return {
        statusFiber,
        getStatus: () => status,
    };
  }),

  dependencies: [
    Socket.SocketController.Default({ url }),
    FetchHttpClient.layer,
  ],
}) {}
