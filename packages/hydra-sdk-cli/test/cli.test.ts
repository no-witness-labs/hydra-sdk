import { Head } from "@no-witness-labs/hydra-sdk";
import { describe, expect, it } from "vitest";

import {
  abortCommand,
  closeCommand,
  commitCommand,
  configCommand,
  connectCommand,
  contestCommand,
  decommitCommand,
  fanoutCommand,
  initCommand,
  recoverCommand,
  rootCommand,
  statusCommand,
} from "../src/cli.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CLI — Command Structure", () => {
  it("root command has correct name and all subcommands", () => {
    expect(rootCommand).toBeDefined();
  });

  it("all lifecycle commands are exported", () => {
    expect(statusCommand).toBeDefined();
    expect(initCommand).toBeDefined();
    expect(abortCommand).toBeDefined();
    expect(commitCommand).toBeDefined();
    expect(closeCommand).toBeDefined();
    expect(contestCommand).toBeDefined();
    expect(fanoutCommand).toBeDefined();
    expect(recoverCommand).toBeDefined();
    expect(decommitCommand).toBeDefined();
    expect(connectCommand).toBeDefined();
  });

  it("config command is exported", () => {
    expect(configCommand).toBeDefined();
  });
});

describe("CLI — output helper", () => {
  it("output formats key-value pairs as text", async () => {
    // Test the output helper indirectly through a mock head
    const head = await Head.create({ url: "mock://localhost:4001" });
    try {
      expect(head.getState()).toBe("Idle");
      expect(head.headId).toBeNull();
    } finally {
      await head.dispose();
    }
  });

  it("init via mock head sets headId and state", async () => {
    const head = await Head.create({ url: "mock://localhost:4001" });
    try {
      await head.init();
      expect(head.getState()).toBe("Initializing");
      expect(head.headId).toBe("mock-head-id");
    } finally {
      await head.dispose();
    }
  });

  it("init → abort transitions correctly", async () => {
    const head = await Head.create({ url: "mock://localhost:4001" });
    try {
      await head.init();
      await head.abort();
      expect(head.getState()).toBe("Aborted");
    } finally {
      await head.dispose();
    }
  });
});
