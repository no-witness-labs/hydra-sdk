#!/usr/bin/env node

import * as Command from "@effect/cli/Command";
import * as NodeContext from "@effect/platform-node/NodeContext";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import { Head, Protocol } from "@no-witness-labs/hydra-sdk";
import { Schedule } from "effect";
import * as Effect from "effect/Effect";

const URL = "ws://172.16.238.30:4001";

const withHead = (
  fn: (head: Head.HydraHead) => Effect.Effect<void>,
): Effect.Effect<void> =>
  Head.effect
    .create({ url: URL })
    .pipe(
      Effect.flatMap((head) =>
        fn(head).pipe(
          Effect.ensuring(head.effect.dispose().pipe(Effect.orDie)),
        ),
      ),
      Effect.orDie,
    );

export const statusCommand = Command.make("status", {}).pipe(
  Command.withHandler(() =>
    withHead((head) =>
      Effect.gen(function* () {
        yield* Effect.logInfo(`The status is: [${head.getState()}]`);
      }).pipe(Effect.repeat(Schedule.spaced("1 second"))),
    ),
  ),
);

export const initializeCommand = Command.make("initialize", {}).pipe(
  Command.withHandler(() =>
    withHead((head) =>
      Effect.gen(function* () {
        yield* Effect.logInfo("Sending Init command");
        yield* head.effect.init();
        yield* Effect.logInfo(`Init complete, status is now [${head.getState()}]`);
      }).pipe(
        Effect.catchAll((e) =>
          Effect.logInfo(`Failed initialize with error: ${e}`),
        ),
      ),
    ),
  ),
);

export const abortCommand = Command.make("abort", {}).pipe(
  Command.withHandler(() =>
    withHead((head) =>
      Effect.gen(function* () {
        yield* Effect.logInfo("Sending Abort command");
        yield* head.effect.abort();
        yield* Effect.logInfo(`Abort complete, status is now [${head.getState()}]`);
      }).pipe(
        Effect.catchAll((e) => Effect.logInfo(`Failed abort with error: ${e}`)),
      ),
    ),
  ),
);

export const closeCommand = Command.make("close", {}).pipe(
  Command.withHandler(() =>
    withHead((head) =>
      Effect.gen(function* () {
        yield* Effect.logInfo("Sending Close command");
        yield* head.effect.close();
        yield* Effect.logInfo(`Close complete, status is now [${head.getState()}]`);
      }).pipe(
        Effect.catchAll((e) => Effect.logInfo(`Failed close with error: ${e}`)),
      ),
    ),
  ),
);

export const commitCommand = Command.make("commit", {}).pipe(
  Command.withHandler(() =>
    withHead((head) =>
      Effect.gen(function* () {
        yield* Effect.logInfo("Sending empty Commit (REST)");
        yield* head.effect.commit({});
        yield* Effect.logInfo(`Commit complete, status is now [${head.getState()}]`);
      }).pipe(
        Effect.catchAll((e) =>
          Effect.logInfo(`Failed commit with error: ${e}`),
        ),
      ),
    ),
  ),
);

export const contestCommand = Command.make("contest", {}).pipe(
  Command.withHandler(() =>
    withHead((head) =>
      Effect.gen(function* () {
        yield* Effect.logInfo("Sending Contest command");
        yield* head.effect.contest();
        yield* Effect.logInfo(`Contest complete, status is now [${head.getState()}]`);
      }).pipe(
        Effect.catchAll((e) =>
          Effect.logInfo(`Failed contest with error: ${e}`),
        ),
      ),
    ),
  ),
);

export const fanoutCommand = Command.make("fanout", {}).pipe(
  Command.withHandler(() =>
    withHead((head) =>
      Effect.gen(function* () {
        yield* Effect.logInfo("Sending Fanout command");
        yield* head.effect.fanout();
        yield* Effect.logInfo(`Fanout complete, status is now [${head.getState()}]`);
      }).pipe(
        Effect.catchAll((e) =>
          Effect.logInfo(`Failed fanout with error: ${e}`),
        ),
      ),
    ),
  ),
);

const command = Command.make("hydra-manager").pipe(
  Command.withSubcommands([
    statusCommand,
    initializeCommand,
    abortCommand,
    closeCommand,
    commitCommand,
    contestCommand,
    fanoutCommand,
  ]),
);

export const runCommands = Command.run(command, {
  name: "Hydra Manager",
  version: "0.1.0",
});

runCommands(process.argv).pipe(
  Effect.provide(NodeContext.layer),
  NodeRuntime.runMain(),
);

// Re-export for tests
export { Head, Protocol };
