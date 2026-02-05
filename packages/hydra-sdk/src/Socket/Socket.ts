import { Socket } from "@effect/platform";
import { WebSocketConstructor } from "@effect/platform/Socket";
import { Effect, Layer, PubSub, Queue, Schedule } from "effect";
import { RuntimeFiber } from "effect/Fiber";
import { WebSocket } from "ws";

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
        const messageQueue: Queue.Queue<Uint8Array> = yield* Queue.unbounded<Uint8Array>();

        const retryPolicy = Schedule.intersect(
          Schedule.exponential("100 millis"),
          Schedule.recurs(20),
        );

        const socketConnection = socket.run((data) => {
          return Queue.offer(messageQueue, data);
        }, {
          onOpen: Effect.logInfo("Socket connected successfully")
        }).pipe(
            Effect.tap(Effect.logInfo(`Socket message received`)),
            Effect.tapError((e) => Effect.logInfo(`Socket error received: ${e}`)),
            Effect.tapDefect((d) => Effect.logInfo(`Socket defect received: ${d}`)),
            Effect.forever
        );

        const socketFiber: RuntimeFiber<void, Socket.SocketError> =
            yield* Effect.fork(
                Effect.retry(socketConnection, retryPolicy)
            )

        const sendMessage = (chunk: string | Uint8Array) =>
          Effect.scoped(
            socket.writer.pipe(
              Effect.flatMap((write) => write(chunk)),
              Effect.tapError((e) =>
                Effect.logInfo(`Failed to send message: ${e}`),
              ),
            ),
          );

        const close = () =>
          Effect.scoped(
            socket.writer.pipe(
              Effect.flatMap((write) => write(new Socket.CloseEvent())),
            ),
          );

        return {
          messageQueue,
          socketFiber,
          sendMessage,
          close,
        };
      }),
    dependencies: [
        Layer.succeed(WebSocketConstructor, (url, options) => {
      return new WebSocket(url, options) as unknown as globalThis.WebSocket;
    }),
    ]
  },
) {}
