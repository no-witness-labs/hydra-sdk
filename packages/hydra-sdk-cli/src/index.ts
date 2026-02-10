#!/usr/bin/env node

import * as Command from "@effect/cli/Command";
import * as NodeContext from "@effect/platform-node/NodeContext";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as Effect from "effect/Effect";
import { Head, Protocol, Socket } from "@no-witness-labs/hydra-sdk";
import { ValidationError } from "@effect/cli/ValidationError";
import { CliApp } from "@effect/cli/CliApp";

export const statusCommand = Command.make("status", {}).pipe(
  Command.withHandler(() => statusHead),
);

export const statusHead = Effect.gen(function* () {
  const hydraStateMachine = yield* Head.HydraStateMachine;
  yield* Effect.logInfo(`The status is: [${hydraStateMachine.getStatus()}]`);
});

const command = Command.make("hydra-manager");

export const runCommands: (
  args: readonly string[],
) => Effect.Effect<
  void,
  ValidationError,
  CliApp.Environment | Head.HydraStateMachine
> = Command.run(command.pipe(Command.withSubcommands([statusCommand])), {
  name: "Hydra Manager",
  version: "0.1.0",
});

runCommands(process.argv).pipe(
  Effect.provide(Head.HydraStateMachine.Default),
  Effect.provide(NodeContext.layer),
  Effect.scoped,
  NodeRuntime.runMain(),
);
