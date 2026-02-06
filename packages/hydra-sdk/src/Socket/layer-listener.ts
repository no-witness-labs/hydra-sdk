#!/usr/bin/env tsx
/**
 * Simple WebSocket Message Listener
 * Connects to ws://localhost:1234 and prints all messages
 */

import { Effect, Logger, Layer, Schedule, Fiber } from "effect";
import { SocketController } from "./Socket.js"

const program: Effect.Effect<void, never, SocketController> = Effect.gen(function* () {
    yield* Effect.logInfo("Starting program...")
    const socketController = yield* SocketController

    yield* Effect.forever(Effect.gen(function* () {
        yield* Effect.logInfo("Waiting for message from queue...")
        const status = yield* socketController.socketFiber.status
        yield* Effect.logInfo(`Fiber status: ${status._tag}`)
        const message = yield* socketController.messageQueue.take
        yield* Effect.logInfo(`Got message: ${new TextDecoder().decode(message)}`)
    }).pipe(Effect.tapError(e => Effect.logInfo(`Error: ${e}`)), Effect.tapDefect(d => Effect.logInfo(`Defect: ${d}`))))

});

const main = program.pipe(
  Effect.scoped,
  Effect.provide(
    SocketController.Default({url: "ws://localhost:1234"})
  ),
  Effect.provide(Logger.pretty),
);

Effect.runFork(main);
