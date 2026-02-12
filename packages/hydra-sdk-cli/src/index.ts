#!/usr/bin/env node

import * as Command from "@effect/cli/Command";
import * as NodeContext from "@effect/platform-node/NodeContext";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as Effect from "effect/Effect";
import { Head } from "@no-witness-labs/hydra-sdk";
import { ValidationError } from "@effect/cli/ValidationError";
import { CliApp } from "@effect/cli/CliApp";
import { Schedule } from "effect";

export const statusCommand = Command.make("status", {}).pipe(
  Command.withHandler(() => statusHeadForever),
);

export const statusHead = Effect.gen(function* () {
  const hydraStateMachine = yield* Head.HydraStateMachine;
  yield* Effect.logInfo(`The status is: [${hydraStateMachine.getStatus()}]`);
});

export const statusHeadForever = statusHead.pipe(Effect.repeat(Schedule.linear("1 second")));

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
