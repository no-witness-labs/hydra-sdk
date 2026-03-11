import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as HydraConfig from "../src/config.js";

describe("Config", () => {
  let tmpDir: string;
  const originalEnv = process.env.XDG_CONFIG_HOME;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hydra-cli-test-"));
    process.env.XDG_CONFIG_HOME = tmpDir;
  });

  afterEach(() => {
    process.env.XDG_CONFIG_HOME = originalEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("configPath uses XDG_CONFIG_HOME", () => {
    expect(HydraConfig.configPath()).toBe(
      path.join(tmpDir, "hydra-sdk", "config.yaml"),
    );
  });

  it("load returns empty object when no config file exists", () => {
    expect(HydraConfig.load()).toEqual({});
  });

  it("save creates config directory and writes YAML", () => {
    HydraConfig.save({ url: "ws://localhost:4001", network: "preprod" });

    const content = fs.readFileSync(HydraConfig.configPath(), "utf8");
    expect(content).toContain("url: ws://localhost:4001");
    expect(content).toContain("network: preprod");
  });

  it("set and get round-trip", () => {
    HydraConfig.set("url", "ws://example.com:4001");
    expect(HydraConfig.get("url")).toBe("ws://example.com:4001");
  });

  it("set preserves existing keys", () => {
    HydraConfig.set("url", "ws://a:1");
    HydraConfig.set("network", "mainnet");

    expect(HydraConfig.get("url")).toBe("ws://a:1");
    expect(HydraConfig.get("network")).toBe("mainnet");
  });

  it("remove deletes a key", () => {
    HydraConfig.set("url", "ws://a:1");
    HydraConfig.set("network", "preprod");

    HydraConfig.remove("url");

    expect(HydraConfig.get("url")).toBeUndefined();
    expect(HydraConfig.get("network")).toBe("preprod");
  });

  it("isValidKey accepts valid keys and rejects invalid ones", () => {
    expect(HydraConfig.isValidKey("url")).toBe(true);
    expect(HydraConfig.isValidKey("mnemonic")).toBe(true);
    expect(HydraConfig.isValidKey("blockfrostKey")).toBe(true);
    expect(HydraConfig.isValidKey("network")).toBe(true);
    expect(HydraConfig.isValidKey("invalid")).toBe(false);
    expect(HydraConfig.isValidKey("")).toBe(false);
  });
});
