#!/usr/bin/env node

import * as NodeContext from "@effect/platform-node/NodeContext";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as Effect from "effect/Effect";

import { runCli } from "./cli.js";

runCli(process.argv).pipe(
  Effect.provide(NodeContext.layer),
  NodeRuntime.runMain(),
);
