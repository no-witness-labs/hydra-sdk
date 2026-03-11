#!/usr/bin/env node

import * as NodeContext from "@effect/platform-node/NodeContext";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as Effect from "effect/Effect";

import { runCli } from "./cli.js";

runCli(process.argv).pipe(
  Effect.provide(NodeContext.layer),
  NodeRuntime.runMain({
    teardown: (_exit, onExit) => {
      // Force exit because daemon fibers / WebSocket handles
      // keep the Node.js event loop alive after the command completes.
      process.exit(_exit._tag === "Success" ? 0 : 1);
      onExit(0);
    },
  }),
);
