import { Socket } from "@effect/platform";
import { Effect, Fiber, Layer, Queue, Ref, Schedule, Schema } from "effect";

import {
  type ApiEvent,
  type ClientInputTag,
  type HeadConfig,
  HeadError,
  type HeadStatus,
  type ServerOutput,
} from "./Head.js";
import {
  InitMessageSchema,
  AbortMessageSchema,
  NewTxMessageSchema,
  RecoverMessageSchema,
  DecommitMessageSchema,
  CloseMessageSchema,
  ContestMessageSchema,
  FanoutMessageSchema,
  SafeCloseMessageSchema,
} from "../Protocol/RequestMessage.js";
import {
  GreetingsMessageSchema,
  CommandFailedMessageSchema,
  PostTxOnChainFailedMessageSchema,
} from "../Protocol/ResponseMessage.js";

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
      return [
        toServerOutput("HeadIsInitializing", {
          headId: "mock-head-id",
          parties: [],
        }),
      ];
    case "NewTx": {
      const txPayload = payload as { txId?: string } | undefined;
      return [
        toServerOutput("TxValid", {
          transactionId: txPayload?.txId ?? "unknown",
        }),
      ];
    }
    case "Close":
      return [toServerOutput("HeadIsClosed"), toServerOutput("ReadyToFanout")];
    case "SafeClose":
      return [toServerOutput("HeadIsClosed"), toServerOutput("ReadyToFanout")];
    case "Fanout":
      return [toServerOutput("HeadIsFinalized")];
    case "Abort":
      return [toServerOutput("HeadIsAborted")];
    case "Recover": {
      const recoverPayload = payload as { recoverTxId?: string } | undefined;
      return [
        toServerOutput("CommitRecovered", {
          recoveredTxId: recoverPayload?.recoverTxId ?? "unknown",
        }),
      ];
    }
    case "Decommit": {
      const decommitPayload = payload as { txId?: string } | undefined;
      return [
        toServerOutput("DecommitApproved", {
          decommitTxId: decommitPayload?.txId ?? "unknown",
        }),
      ];
    }
    case "Contest":
      return [toServerOutput("HeadIsContested")];
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
  switch (value) {
    case "Init":
    case "Commit":
    case "NewTx":
    case "Close":
    case "SafeClose":
    case "Fanout":
    case "Abort":
    case "Recover":
    case "Decommit":
    case "Contest":
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
    case "RecoverTx":
      return "Recover";
    case "ContestTx":
      return "Contest";
    default:
      return undefined;
  }
};

/** Try synchronous schema decode, returning null on failure. */
const tryDecode = <A, I>(
  schema: Schema.Schema<A, I>,
  value: unknown,
): A | null => {
  try {
    return Schema.decodeUnknownSync(schema)(value);
  } catch {
    return null;
  }
};

const parseApiEvent = (raw: string): Effect.Effect<ApiEvent, HeadError> =>
  Effect.try({
    try: (): ApiEvent => {
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      // 1. Greetings — decode with GreetingsMessageSchema
      if (
        typeof parsed.headStatus === "string" &&
        ("me" in parsed || "hydraNodeVersion" in parsed)
      ) {
        const decoded = tryDecode(GreetingsMessageSchema, parsed);
        if (decoded) {
          return {
            _tag: "Greetings",
            greetings: { headStatus: decoded.headStatus },
          };
        }
        // Fallback: extract headStatus manually
        const status = parseHeadStatus(parsed.headStatus);
        if (status === null) {
          throw new Error(`Unsupported head status: ${parsed.headStatus}`);
        }
        return { _tag: "Greetings", greetings: { headStatus: status } };
      }

      // 2. InvalidInput — reason without tag (legacy) or tag: "InvalidInput"
      if (
        parsed.tag === "InvalidInput" ||
        (typeof parsed.reason === "string" && !("tag" in parsed))
      ) {
        return {
          _tag: "InvalidInput",
          invalidInput: {
            reason:
              typeof parsed.reason === "string" ? parsed.reason : "Unknown",
            input: typeof parsed.input === "string" ? parsed.input : undefined,
          },
        };
      }

      const tag = typeof parsed.tag === "string" ? parsed.tag : undefined;
      if (!tag) {
        throw new Error("Missing event tag");
      }

      // 3. CommandFailed — decode with CommandFailedMessageSchema
      if (tag === "CommandFailed") {
        const decoded = tryDecode(CommandFailedMessageSchema, parsed);
        return {
          _tag: "ClientMessage",
          message: {
            tag: "CommandFailed",
            clientInputTag: decoded
              ? parseClientInputTag(decoded.clientInput.tag)
              : parseClientInputTag(
                  (parsed.clientInput as { tag?: unknown } | undefined)?.tag,
                ),
          },
        };
      }

      // 4. PostTxOnChainFailed — decode with PostTxOnChainFailedMessageSchema
      if (tag === "PostTxOnChainFailed") {
        const decoded = tryDecode(PostTxOnChainFailedMessageSchema, parsed);
        return {
          _tag: "ClientMessage",
          message: {
            tag: "PostTxOnChainFailed",
            clientInputTag: decoded
              ? parseChainTxTag(decoded.postChainTx.tag)
              : parseChainTxTag(
                  (parsed.postChainTx as { tag?: unknown } | undefined)?.tag,
                ),
            reason: decoded
              ? `PostTxOnChainFailed: ${JSON.stringify(decoded.postTxError)}`
              : typeof parsed.postTxError === "object"
                ? `PostTxOnChainFailed: ${JSON.stringify(parsed.postTxError)}`
                : undefined,
          },
        };
      }

      // 5. RejectedInputBecauseUnsynced
      if (tag === "RejectedInputBecauseUnsynced") {
        return {
          _tag: "ClientMessage",
          message: { tag: "RejectedInputBecauseUnsynced" },
        };
      }

      // 6. All other server outputs — pass through with raw payload
      return { _tag: "ServerOutput", output: { tag, payload: parsed } };
    },
    catch: (cause) =>
      new HeadError({
        message: "Failed to parse websocket event",
        cause,
      }),
  });

const buildRequestMessage = (
  tag: ClientInputTag,
  payload?: unknown,
): Effect.Effect<unknown, unknown> => {
  switch (tag) {
    case "Init":
      return Schema.encode(InitMessageSchema)({ tag: "Init" });
    case "Abort":
      return Schema.encode(AbortMessageSchema)({ tag: "Abort" });
    case "Close":
      return Schema.encode(CloseMessageSchema)({ tag: "Close" });
    case "SafeClose":
      return Schema.encode(SafeCloseMessageSchema)({ tag: "SafeClose" });
    case "Fanout":
      return Schema.encode(FanoutMessageSchema)({ tag: "Fanout" });
    case "Contest":
      return Schema.encode(ContestMessageSchema)({ tag: "Contest" });
    case "NewTx":
      return Schema.encode(NewTxMessageSchema)({
        tag: "NewTx",
        transaction: payload as { type: "Tx ConwayEra" | "Unwitnessed Tx ConwayEra" | "Witnessed Tx ConwayEra"; description: string; cborHex: string; txId: string },
      });
    case "Recover":
      return Schema.encode(RecoverMessageSchema)({
        tag: "Recover",
        recoverTxId: (payload as { recoverTxId?: string })?.recoverTxId ?? "",
      });
    case "Decommit":
      return Schema.encode(DecommitMessageSchema)({
        tag: "Decommit",
        decommitTx: payload as { type: "Tx ConwayEra" | "Unwitnessed Tx ConwayEra" | "Witnessed Tx ConwayEra"; description: string; cborHex: string; txId: string },
      });
    case "Commit":
      return Effect.fail(
        new HeadError({
          message: "Commit uses REST API, not WebSocket transport",
        }),
      );
    default: {
      const _exhaustive: never = tag;
      return Effect.fail(
        new HeadError({ message: `Unsupported client input ${_exhaustive}` }),
      );
    }
  }
};

const encodeClientInput = (
  tag: ClientInputTag,
  payload?: unknown,
): Effect.Effect<string, HeadError> =>
  buildRequestMessage(tag, payload).pipe(
    Effect.map((msg) => JSON.stringify(msg)),
    Effect.mapError(
      (cause) =>
        new HeadError({
          message: `Failed to encode command ${tag}`,
          cause,
        }),
    ),
  );

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
