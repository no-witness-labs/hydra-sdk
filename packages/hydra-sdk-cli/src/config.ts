import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { parse, stringify } from "yaml";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HydraConfig {
  url?: string;
  mnemonic?: string;
  blockfrostKey?: string;
  network?: string;
}

// ---------------------------------------------------------------------------
// XDG Paths
// ---------------------------------------------------------------------------

const configDir = (): string => {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg || path.join(os.homedir(), ".config");
  return path.join(base, "hydra-sdk");
};

export const configPath = (): string => path.join(configDir(), "config.yaml");

// ---------------------------------------------------------------------------
// Read / Write
// ---------------------------------------------------------------------------

export const load = (): HydraConfig => {
  const filePath = configPath();
  if (!fs.existsSync(filePath)) return {};
  const raw = fs.readFileSync(filePath, "utf8");
  return (parse(raw) as HydraConfig) ?? {};
};

export const save = (config: HydraConfig): void => {
  const dir = configDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath(), stringify(config), "utf8");
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_KEYS = new Set<keyof HydraConfig>([
  "url",
  "mnemonic",
  "blockfrostKey",
  "network",
]);

export const isValidKey = (key: string): key is keyof HydraConfig =>
  VALID_KEYS.has(key as keyof HydraConfig);

export const get = (key: keyof HydraConfig): string | undefined =>
  load()[key];

export const set = (key: keyof HydraConfig, value: string): void => {
  const config = load();
  (config as Record<string, string>)[key] = value;
  save(config);
};

export const remove = (key: keyof HydraConfig): void => {
  const config = load();
  delete config[key];
  save(config);
};
