#!/usr/bin/env node

import type { CliApp } from "@effect/cli/CliApp";
import * as Command from "@effect/cli/Command";
import type { ValidationError } from "@effect/cli/ValidationError";
import * as NodeContext from "@effect/platform-node/NodeContext";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import { Head, Protocol, Socket, Config } from "@no-witness-labs/hydra-sdk";
import * as Effect from "effect/Effect";

export const statusCommand = Command.make("status", {}).pipe(
  Command.withHandler(() =>
    Effect.gen(function* () {
      const HydraHeadController = yield* Head.HydraHeadController;
      yield* HydraHeadController.logStatusHeadForewer;
    }),
  ),
);

export const initializeCommand = Command.make("initialize", {}).pipe(
  Command.withHandler(() =>
    Effect.gen(function* () {
      const HydraHeadController = yield* Head.HydraHeadController;
      yield* HydraHeadController.initialize.pipe(
        Effect.catchAll((e) =>
          Effect.logInfo(`Failed initialize with error: ${e}`),
        ),
      );
    }),
  ),
);

export const abortCommand = Command.make("abort", {}).pipe(
  Command.withHandler(() =>
    Effect.gen(function* () {
      const HydraHeadController = yield* Head.HydraHeadController;
      yield* HydraHeadController.abort.pipe(
        Effect.catchAll((e) => Effect.logInfo(`Failed abort with error: ${e}`)),
      );
    }),
  ),
);

export const closeCommand = Command.make("close", {}).pipe(
  Command.withHandler(() =>
    Effect.gen(function* () {
      const HydraHeadController = yield* Head.HydraHeadController;
      yield* HydraHeadController.close.pipe(
        Effect.catchAll((e) => Effect.logInfo(`Failed close with error: ${e}`)),
      );
    }),
  ),
);

export const commitCommand = Command.make("commit", {}).pipe(
  Command.withHandler(() =>
    Effect.gen(function* () {
      const HydraHeadController = yield* Head.HydraHeadController;
      yield* HydraHeadController.commit.pipe(
        Effect.catchAll((e) =>
          Effect.logInfo(`Failed commit with error: ${e}`),
        ),
      );
    }),
  ),
);

export const contestCommand = Command.make("contest", {}).pipe(
  Command.withHandler(() =>
    Effect.gen(function* () {
      const HydraHeadController = yield* Head.HydraHeadController;
      yield* HydraHeadController.contest.pipe(
        Effect.catchAll((e) =>
          Effect.logInfo(`Failed contest with error: ${e}`),
        ),
      );
    }),
  ),
);

export const fanoutCommand = Command.make("fanout", {}).pipe(
  Command.withHandler(() =>
    Effect.gen(function* () {
      const HydraHeadController = yield* Head.HydraHeadController;
      yield* HydraHeadController.fanout.pipe(
        Effect.catchAll((e) =>
          Effect.logInfo(`Failed fanout with error: ${e}`),
        ),
      );
    }),
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

export const runCommands: (
  args: ReadonlyArray<string>,
) => Effect.Effect<
  void,
  ValidationError,
  CliApp.Environment | Head.HydraStateMachine | Head.HydraHeadController
> = Command.run(command, {
  name: "Hydra Manager",
  version: "0.1.0",
});

const urlNoAppends = "172.16.238.30:4001";

runCommands(process.argv).pipe(
  Effect.provide(Head.HydraHeadController.Default),
  Effect.provide(Head.HydraStateMachine.Default),
  Effect.provide(Socket.SocketController.Default),
  Effect.provide(Config.Config.Default(urlNoAppends)),
  Effect.provide(NodeContext.layer),
  Effect.scoped,
  NodeRuntime.runMain(),
);

// Export and reimport since the lsp doesn't like to import @no-witness-labs/hydra-sdk-cli in tests
export { Head, Protocol, Socket, Config };
