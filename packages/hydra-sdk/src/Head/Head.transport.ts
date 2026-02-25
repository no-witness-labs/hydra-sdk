import { Socket } from "@effect/platform";
import { Effect, Fiber, Layer, Queue, Ref, Schedule } from "effect";

import {
  type ApiEvent,
  type ClientInputTag,
  type HeadConfig,
  HeadError,
  type HeadStatus,
  type ServerOutput,
} from "./Head.js";

export interface HeadTransport {
  readonly events: {
    readonly publish: (event: ApiEvent) => Effect.Effect<void>;
    readonly subscribe: Effect.Effect<{
      readonly queue: Queue.Dequeue<ApiEvent>;
      readonly unsubscribe: Effect.Effect<void>;
    }>;
    readonly shutdown: Effect.Effect<void>;
  };
  readonly generation: Ref.Ref<number>;
  readonly send: (
    tag: ClientInputTag,
    payload?: unknown,
  ) => Effect.Effect<void, HeadError>;
  readonly dispose: Effect.Effect<void, never>;
}

interface NormalizedReconnect {
  readonly maxRetries: number;
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly factor: number;
  readonly jitter: number;
}

const clampAtLeastZero = (value: number): number => Math.max(0, value);

const isNodeJs =
  typeof process !== "undefined" && process.versions?.node !== undefined;

const makeWebSocketConstructorLayer: Effect.Effect<
  Layer.Layer<Socket.WebSocketConstructor>,
  HeadError
> = Effect.gen(function* () {
  // In browsers, use the native global WebSocket.
  // In Node.js, always prefer the `ws` library — Node's built-in
  // globalThis.WebSocket (undici-based) has compatibility issues with
  // @effect/platform's Socket module.
  if (!isNodeJs && typeof globalThis.WebSocket === "function") {
    return Socket.layerWebSocketConstructorGlobal;
  }

  const wsModule = yield* Effect.tryPromise({
    try: () => import("ws"),
    catch: (cause) =>
      new HeadError({
        message:
          "No global WebSocket available and failed to load ws fallback module",
        cause,
      }),
  });

  const WsClass = wsModule.default ?? wsModule.WebSocket;

  return Layer.succeed(
    Socket.WebSocketConstructor,
    Socket.WebSocketConstructor.of(
      (url, protocols) =>
        new WsClass(url, protocols) as unknown as globalThis.WebSocket,
    ),
  );
});

const toServerOutput = (tag: string, payload?: unknown): ApiEvent => ({
  _tag: "ServerOutput",
  output: {
    tag,
    payload,
  },
});

const commandToEvents = (
  tag: ClientInputTag,
  payload?: unknown,
): Array<ApiEvent> => {
  switch (tag) {
    case "Init":
      return [toServerOutput("HeadIsInitializing")];
    case "Commit":
      // TODO(protocol-schema): Commit is a Hydra REST operation, not a websocket command.
      // This mock-only event path exists to keep scaffold tests deterministic until
      // REST integration is implemented in the Head module.
      return [toServerOutput("HeadIsOpen", payload)];
    case "Close":
      return [toServerOutput("HeadIsClosed"), toServerOutput("ReadyToFanout")];
    case "SafeClose":
      return [toServerOutput("HeadIsClosed"), toServerOutput("ReadyToFanout")];
    case "Fanout":
      return [toServerOutput("HeadIsFinalized")];
    case "Abort":
      return [toServerOutput("HeadIsAborted")];
    default:
      return [
        {
          _tag: "ClientMessage",
          message: {
            tag: "CommandFailed",
            clientInputTag: tag,
          },
        },
      ];
  }
};

const normalizeReconnect = (config: HeadConfig): NormalizedReconnect => ({
  maxRetries: config.reconnect?.maxRetries ?? 10,
  initialDelayMs: config.reconnect?.initialDelayMs ?? 500,
  maxDelayMs: config.reconnect?.maxDelayMs ?? 30_000,
  factor: config.reconnect?.factor ?? 1.7,
  jitter: clampAtLeastZero(config.reconnect?.jitter ?? 0.2),
});

const makeReconnectPolicy = (
  reconnect: NormalizedReconnect,
): Schedule.Schedule<unknown, HeadError> => {
  const boundedExponential = Schedule.exponential(
    `${reconnect.initialDelayMs} millis`,
    reconnect.factor,
  ).pipe(Schedule.union(Schedule.spaced(`${reconnect.maxDelayMs} millis`)));

  const minJitter = clampAtLeastZero(1 - reconnect.jitter);
  const maxJitter = clampAtLeastZero(1 + reconnect.jitter);

  return boundedExponential.pipe(
    Schedule.jitteredWith({ min: minJitter, max: maxJitter }),
    Schedule.intersect(Schedule.recurs(reconnect.maxRetries)),
  );
};

const withHistoryQuery = (url: string, history: boolean): string => {
  const normalized = new URL(url);
  normalized.searchParams.set("history", history ? "yes" : "no");
  return normalized.toString();
};

const parseHeadStatus = (value: unknown): HeadStatus | null => {
  switch (value) {
    case "Idle":
    case "Initializing":
    case "Open":
    case "Closed":
    case "FanoutPossible":
    case "Final":
      return value;
    default:
      return null;
  }
};

const parseClientInputTag = (value: unknown): ClientInputTag | undefined => {
  // TODO(protocol-schema): Commit and SafeClose are scaffold-only tags.
  // Keep parsing them for backward-compatible mock/error plumbing until
  // REST commit integration and websocket command alignment are completed.
  switch (value) {
    case "Init":
    case "Commit":
    case "Close":
    case "SafeClose":
    case "Fanout":
    case "Abort":
      return value;
    default:
      return undefined;
  }
};

const parseChainTxTag = (value: unknown): ClientInputTag | undefined => {
  switch (value) {
    case "InitTx":
      return "Init";
    case "CommitTx":
      return "Commit";
    case "CloseTx":
      return "Close";
    case "FanoutTx":
      return "Fanout";
    case "AbortTx":
      return "Abort";
    default:
      return undefined;
  }
};

const parseApiEvent = (raw: string): Effect.Effect<ApiEvent, HeadError> =>
  Effect.try({
    try: () => {
      // TODO(protocol-schema): Replace this hand-written parser with Effect Schema decoders
      // from `origin/protocol-module`:
      // - packages/hydra-sdk/src/Protocol/ResponseMessage.ts
      // - packages/hydra-sdk/src/Protocol/CommonMessage.ts
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      if (
        typeof parsed.headStatus === "string" &&
        ("me" in parsed || "hydraNodeVersion" in parsed)
      ) {
        const status = parseHeadStatus(parsed.headStatus);
        if (status === null) {
          throw new Error(`Unsupported head status: ${parsed.headStatus}`);
        }

        return {
          _tag: "Greetings",
          greetings: {
            headStatus: status,
          },
        } satisfies ApiEvent;
      }

      if (typeof parsed.reason === "string") {
        return {
          _tag: "InvalidInput",
          invalidInput: {
            reason: parsed.reason,
            input: typeof parsed.input === "string" ? parsed.input : undefined,
          },
        } satisfies ApiEvent;
      }

      const tag = typeof parsed.tag === "string" ? parsed.tag : undefined;
      if (!tag) {
        throw new Error("Missing event tag");
      }

      if (
        tag === "CommandFailed" ||
        tag === "RejectedInputBecauseUnsynced" ||
        tag === "PostTxOnChainFailed"
      ) {
        // CommandFailed uses clientInput.tag, PostTxOnChainFailed uses
        // postChainTx.tag (e.g. "CloseTx" → "Close"). Try both sources.
        const clientInput = parsed.clientInput as { tag?: unknown } | undefined;
        const postChainTx = parsed.postChainTx as
          | { tag?: unknown }
          | undefined;
        const inputTag =
          parseClientInputTag(clientInput?.tag) ??
          parseChainTxTag(postChainTx?.tag);
        return {
          _tag: "ClientMessage",
          message: {
            tag,
            clientInputTag: inputTag,
            reason:
              typeof parsed.reason === "string" ? parsed.reason : undefined,
          },
        } satisfies ApiEvent;
      }

      return {
        _tag: "ServerOutput",
        output: {
          tag,
          payload: parsed,
        },
      } satisfies ApiEvent;
    },
    catch: (cause) =>
      new HeadError({
        message: "Failed to parse websocket event",
        cause,
      }),
  });

const encodeClientInput = (
  tag: ClientInputTag,
  _payload?: unknown,
): Effect.Effect<string, HeadError> =>
  Effect.try({
    try: () => {
      // TODO(protocol-schema): Replace this ad-hoc encoder with request schemas
      // from `origin/protocol-module`:
      // - packages/hydra-sdk/src/Protocol/RequestMessage.ts
      switch (tag) {
        case "Init":
        case "Close":
        case "SafeClose":
        case "Fanout":
        case "Abort":
          return JSON.stringify({ tag });
        case "Commit":
          throw new Error(
            'Unsupported client input "Commit": must be sent via REST API, not websocket',
          );
        default: {
          const _exhaustive: never = tag;
          throw new Error(`Unsupported client input ${_exhaustive}`);
        }
      }
    },
    catch: (cause) =>
      new HeadError({
        message: `Failed to encode command ${tag}`,
        cause,
      }),
  });

export const makeHeadTransport = (
  config: HeadConfig,
): Effect.Effect<HeadTransport, HeadError> =>
  Effect.gen(function* () {
    const { url } = config;
    if (url.length === 0) {
      return yield* Effect.fail(
        new HeadError({ message: "Head config url is required" }),
      );
    }

    if (!url.startsWith("mock://")) {
      yield* Effect.try({
        try: () => {
          new URL(url);
        },
        catch: (cause) =>
          new HeadError({
            message: `Invalid Head transport url: ${url}`,
            cause,
          }),
      });
    }

    const subscriberQueues = new Set<Queue.Enqueue<ApiEvent>>();

    const events = {
      publish: (event: ApiEvent): Effect.Effect<void> =>
        Effect.forEach(subscriberQueues, (queue) =>
          Queue.offer(queue, event),
        ).pipe(Effect.asVoid),
      subscribe: Effect.gen(function* () {
        const queue = yield* Queue.unbounded<ApiEvent>();
        subscriberQueues.add(queue);

        return {
          queue,
          unsubscribe: Effect.sync(() => {
            subscriberQueues.delete(queue);
          }),
        };
      }),
      shutdown: Effect.forEach(subscriberQueues, (queue) =>
        Queue.shutdown(queue).pipe(Effect.orDie),
      ).pipe(Effect.asVoid),
    };

    const generation = yield* Ref.make(0);

    if (url.startsWith("mock://")) {
      const greeting: ApiEvent = {
        _tag: "Greetings",
        greetings: {
          headStatus: "Idle" satisfies HeadStatus,
        },
      };
      yield* events.publish(greeting);

      const send = (
        tag: ClientInputTag,
        payload?: unknown,
      ): Effect.Effect<void, HeadError> =>
        Effect.forEach(commandToEvents(tag, payload), (event) =>
          events.publish(event),
        ).pipe(
          Effect.asVoid,
          Effect.mapError(
            (cause) =>
              new HeadError({
                message: `Failed to send command ${tag}`,
                cause,
              }),
          ),
        );

      const dispose = events.shutdown.pipe(Effect.orDie);

      return {
        events,
        generation,
        send,
        dispose,
      };
    }

    const reconnect = normalizeReconnect(config);
    const reconnectPolicy = makeReconnectPolicy(reconnect);
    const outbound = yield* Queue.unbounded<string>();
    const isDisposed = yield* Ref.make(false);
    const webSocketConstructorLayer = yield* makeWebSocketConstructorLayer;

    const socketSession = (socketUrl: string): Effect.Effect<void, HeadError> =>
      Effect.scoped(
        Effect.gen(function* () {
          const socket = yield* Socket.makeWebSocket(socketUrl).pipe(
            Effect.mapError(
              (cause) =>
                new HeadError({
                  message: `Failed to connect websocket at ${socketUrl}`,
                  cause,
                }),
            ),
          );

          yield* Ref.update(generation, (n) => n + 1);

          const write = yield* socket.writer.pipe(
            Effect.mapError(
              (cause) =>
                new HeadError({
                  message: "Failed to create websocket writer",
                  cause,
                }),
            ),
          );

          const readerFiber = yield* Effect.forkDaemon(
            socket
              .run((data: Uint8Array) => {
                const raw = new TextDecoder().decode(data);
                return parseApiEvent(raw).pipe(Effect.flatMap(events.publish));
              })
              .pipe(
                Effect.mapError(
                  (cause) =>
                    new HeadError({
                      message: "Websocket reader failed",
                      cause,
                    }),
                ),
              ),
          );

          const writerFiber = yield* Effect.forkDaemon(
            Effect.forever(
              Queue.take(outbound).pipe(
                Effect.flatMap((raw) => write(raw)),
                Effect.mapError(
                  (cause) =>
                    new HeadError({
                      message: "Websocket writer failed",
                      cause,
                    }),
                ),
              ),
            ),
          );

          const result = yield* Fiber.join(readerFiber).pipe(
            Effect.ensuring(Fiber.interrupt(writerFiber)),
            Effect.asVoid,
          );

          return result;
        }),
      ).pipe(Effect.provide(webSocketConstructorLayer));

    const reconnectFiber = yield* Effect.forkDaemon(
      Effect.gen(function* () {
        let firstConnection = true;

        while (!(yield* Ref.get(isDisposed))) {
          const useHistory = firstConnection
            ? (config.historyOnConnect ?? false)
            : (config.historyOnReconnect ?? true);
          const socketUrl = withHistoryQuery(url, useHistory);

          const result = yield* Effect.exit(
            socketSession(socketUrl).pipe(Effect.retry(reconnectPolicy)),
          );
          if (result._tag === "Success") {
            firstConnection = false;
            continue;
          }

          yield* events.publish({
            _tag: "InvalidInput",
            invalidInput: {
              reason: `Websocket reconnect attempts exhausted after ${reconnect.maxRetries} retries`,
            },
          });
          break;
        }
      }),
    );

    const send = (
      tag: ClientInputTag,
      payload?: unknown,
    ): Effect.Effect<void, HeadError> =>
      Effect.gen(function* () {
        if (tag === "Commit") {
          return yield* Effect.fail(
            new HeadError({
              message:
                "Commit is scaffold-only in mock transport and must use REST API in real transport",
            }),
          );
        }

        const encoded = yield* encodeClientInput(tag, payload);
        yield* Queue.offer(outbound, encoded);
      }).pipe(
        Effect.mapError(
          (cause) =>
            new HeadError({
              message: `Failed to send command ${tag}`,
              cause,
            }),
        ),
      );

    const dispose = Effect.gen(function* () {
      yield* Ref.set(isDisposed, true);
      yield* Fiber.interrupt(reconnectFiber);
      yield* Queue.shutdown(outbound).pipe(Effect.orDie);
      yield* events.shutdown;
    }).pipe(Effect.orDie);

    return {
      events,
      generation,
      send,
      dispose,
    };
  });

export const isServerOutput = (
  event: ApiEvent,
): event is { _tag: "ServerOutput"; output: ServerOutput } =>
  event._tag === "ServerOutput";
