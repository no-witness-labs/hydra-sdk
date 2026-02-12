import { Protocol, Socket } from "@no-witness-labs/hydra-sdk";
import { Effect, Option, Schema } from "effect";

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

            const maybeStatus: Option.Option<Protocol.Status> =
              yield* Effect.option(
                Schema.decode(
                  Schema.parseJson(Protocol.WebSocketResponseMessageSchema),
                )(messageText),
              ).pipe(
                Effect.map(Option.flatMap(Protocol.socketMessageToStatus)),
              );

            if (Option.isSome(maybeStatus)) {
              const newStatus = yield* maybeStatus;
              yield* Effect.log(
                `Valid status received [${newStatus}] from message: ${messageText}`,
              );
              status = newStatus;
            }
          }
        }),
      );

      return {
        statusFiber,
        getStatus: () => status,
      };
    }),

    dependencies: [Socket.SocketController.Default({ url })],
  },
) {}
