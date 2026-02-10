import { Effect, pipe, Option, Schema } from "effect";
import { Socket, Head, Protocol } from "@no-witness-labs/hydra-sdk";
import {} from "@no-witness-labs/hydra-sdk";
import { FetchHttpClient } from "@effect/platform";

const url = "ws://localhost:4001";

export class HydraStateMachine extends Effect.Service<HydraStateMachine>()(
  "HydraStateMachine",
  {
    effect: Effect.gen(function* () {
      yield* Effect.log("HydraStateMachine was created");

      const socketController = yield* Socket.SocketController;
      const messageQueue = yield* socketController.messageQueue.subscribe;
      let status: Protocol.Status = "DISCONNECTED";

      const statusFiber = yield* Effect.fork(
        Effect.gen(function* () {
          let rawMessage: Uint8Array;
          while ((rawMessage = yield* messageQueue.take)) {
            const messageText: string = new TextDecoder().decode(rawMessage);
            yield* Effect.logInfo(`DEBUG: caught messageText: ${messageText}`)
            const mbDebugStatus = Effect.option(Schema.decode(
                  Schema.parseJson(Protocol.WebSocketResponseMessageSchema),
                )(messageText))
            yield* Effect.logInfo(`DEBUG: mbDebugStatus: ${JSON.stringify(mbDebugStatus)}`)

            const maybeStatus: Option.Option<Protocol.Status> =
              yield* Effect.option(
                Schema.decode(
                  Schema.parseJson(Protocol.WebSocketResponseMessageSchema),
                )(messageText),
              ).pipe(
                Effect.map(Option.flatMap(Protocol.socketMessageToStatus)),
              );

            yield* Effect.logInfo(`DEBUG: maybeStatus: ${JSON.stringify(maybeStatus)}`)


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
  },
) {}
