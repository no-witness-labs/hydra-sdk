import { Socket } from "@effect/platform";
import { Effect, PubSub, Schedule } from "effect";
import { RuntimeFiber } from "effect/Fiber";

type SocketConfig = {
  url: string;
};

export class SocketController extends Effect.Service<SocketController>()(
  "SocketController",
  {
    effect: ({ url }: SocketConfig) =>
      Effect.gen(function* () {
        yield* Effect.log(`SocketController was created at: ${url}`);

        const socket: Socket.Socket = yield* Socket.makeWebSocket(url);
        const messageQueue: PubSub.PubSub<Uint8Array<ArrayBufferLike>> =
          yield* PubSub.unbounded<Uint8Array>();

        const retryPolicy = Schedule.intersect(
          Schedule.exponential("100 millis"),
          Schedule.recurs(20),
        );

        const socketConnectionFiber: RuntimeFiber<void, Socket.SocketError> =
          yield* Effect.fork(
            socket.run((data) => {
              return Effect.gen(function* () {
                yield* Effect.logDebug(`Socket Message received: ${data}`);
                return yield* PubSub.publish(messageQueue, data);
              });
            }),
          );

        const socketFiber = yield* Effect.fork(
          Effect.retry(socketConnectionFiber, retryPolicy).pipe(
            Effect.tapError((error) =>
              Effect.logError(`Socket connection failed: ${error}`),
            ),
          ),
        );

        const sendMessage = (chunk: string | Uint8Array) =>
          socket.writer.pipe(
            Effect.flatMap((write) => write(chunk)),
            Effect.tapError((e) =>
              Effect.logError(`Failed to send message: ${e}`),
            ),
          );

        const close = () =>
          socket.writer.pipe(
            Effect.flatMap((write) => write(new Socket.CloseEvent())),
          );

        return {
          messageQueue,
          socketFiber,
          sendMessage,
          close,
        };
      }),
  },
) {}
