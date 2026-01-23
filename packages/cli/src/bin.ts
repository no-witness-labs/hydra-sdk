#!/usr/bin/env node

import * as NodeContext from "@effect/platform-node/NodeContext";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as Effect from "effect/Effect";
import * as Command from "@effect/cli/Command";
import * as Platform from "@effect/platform"

export const statusCommand = Command.make("status", {}).pipe(
  Command.withHandler(() => statusHead),
);

export const statusHead = Effect.gen(function* () {
  yield* Effect.logInfo("Head status placeholder");
});

const command = Command.make("hydra-manager");

export const runCommands = Command.run(
  command.pipe(
    Command.withSubcommands([
      statusCommand,
    ]),
  ),
  {
    name: "Hydra Manager",
    version: "0.1.0",
  },
);


runCommands(process.argv).pipe(
    Effect.scoped,
    Effect.provide(NodeContext.layer),
    NodeRuntime.runMain()
)
