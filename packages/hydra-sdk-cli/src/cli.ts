import * as Command from "@effect/cli/Command";
import * as Options from "@effect/cli/Options";
import type { UTxO } from "@evolution-sdk/evolution";
import {
  AssetName,
  Assets,
  createClient,
  PolicyId,
  Transaction,
  TransactionHash,
  TransactionWitnessSet,
} from "@evolution-sdk/evolution";
import { Head, Provider } from "@no-witness-labs/hydra-sdk";
import { Config, Duration, Effect, Schedule } from "effect";

import * as HydraConfig from "./config.js";

// ---------------------------------------------------------------------------
// Config-aware fallback: CLI flag → env var → config file
// ---------------------------------------------------------------------------

const configFallback = (envKey: string, configKey: keyof HydraConfig.HydraConfig): Config.Config<string> =>
  Config.string(envKey).pipe(
    Config.orElse(() =>
      Config.sync(() => {
        const v = HydraConfig.get(configKey);
        if (v === undefined) throw new Error(`No ${configKey} in config`);
        return v;
      }),
    ),
  );

// ---------------------------------------------------------------------------
// Global Options (shared by all commands that need a head connection)
// ---------------------------------------------------------------------------

const urlOption = Options.text("url").pipe(
  Options.withFallbackConfig(configFallback("HYDRA_NODE_URL", "url")),
  Options.withDescription(
    "Hydra node WebSocket URL (e.g. ws://localhost:4001). Falls back to HYDRA_NODE_URL env var or config file.",
  ),
);

const jsonOption = Options.boolean("json").pipe(
  Options.withDefault(false),
  Options.withDescription("Output results as JSON"),
);

const headOptions = { json: jsonOption, url: urlOption };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const output = (json: boolean, data: Record<string, unknown>): string =>
  json
    ? JSON.stringify(data)
    : Object.entries(data)
        .map(([k, v]) => `${k}: ${String(v)}`)
        .join(", ");

/**
 * Create a Head, run a program with it, then exit.
 * The CLI entry point handles process.exit() via custom teardown.
 */
const withHead = (
  url: string,
  program: (head: Head.HydraHead) => Effect.Effect<void, Head.HeadError>,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const head = yield* Head.effect.create({ url });
    yield* program(head);
  }).pipe(
    Effect.catchTag("HeadError", (e) =>
      Effect.logError(`Error: ${e.message}`),
    ),
  );

/** Send a command and wait briefly for the WebSocket writer to flush. */
const sendCommand = (
  head: Head.HydraHead,
  command: Head.ClientInputTag,
  payload?: unknown,
) =>
  head.effect.send(command, payload).pipe(
    Effect.andThen(Effect.sleep(Duration.millis(200))),
  );

/** Convert a WebSocket URL to its HTTP counterpart. */
const wsToHttp = (wsUrl: string): string =>
  wsUrl.replace(/^ws(s?):\/\//, "http$1://");

/** Format lovelace as ADA string. */
const formatAda = (lovelace: bigint): string =>
  `${(Number(lovelace) / 1_000_000).toFixed(6)} ADA`;

/** Format a single evolution-sdk UTxO for display. */
const formatUtxo = (u: UTxO.UTxO): string => {
  const txHash = TransactionHash.toHex(u.transactionId);
  const lovelace = Assets.lovelaceOf(u.assets);
  const tokens = Assets.flatten(u.assets);
  const nativeAssets = tokens
    .map(
      ([pid, name, qty]) =>
        `${PolicyId.toHex(pid).slice(0, 8)}..${AssetName.toHex(name) || "lovelace"}: ${qty}`,
    )
    .join(", ");
  return `${txHash}#${u.index} — ${formatAda(lovelace)}${nativeAssets ? ` + ${nativeAssets}` : ""}`;
};

/** Create an evolution-sdk SigningClient from mnemonic + blockfrost key. */
const makeWalletClient = (mnemonic: string, blockfrostKey: string) =>
  createClient({
    network: "preprod",
    provider: {
      type: "blockfrost",
      baseUrl: "https://cardano-preprod.blockfrost.io/api/v0",
      projectId: blockfrostKey,
    },
    wallet: { type: "seed" as const, mnemonic },
  });

/** Shared wallet options for commands that need L1 wallet access. */
const walletOptions = {
  mnemonic: Options.text("mnemonic").pipe(
    Options.withFallbackConfig(configFallback("HYDRA_MNEMONIC", "mnemonic")),
    Options.withDescription(
      "BIP39 seed phrase. Falls back to HYDRA_MNEMONIC env var or config file.",
    ),
  ),
  blockfrostKey: Options.text("blockfrost-key").pipe(
    Options.withFallbackConfig(configFallback("HYDRA_BLOCKFROST_KEY", "blockfrostKey")),
    Options.withDescription(
      "Blockfrost project ID. Falls back to HYDRA_BLOCKFROST_KEY env var or config file.",
    ),
  ),
};

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

const watchOption = Options.boolean("watch").pipe(
  Options.withAlias("w"),
  Options.withDefault(false),
  Options.withDescription("Continuously watch status (1s interval)"),
);

export const statusCommand = Command.make("status", {
  ...headOptions,
  watch: watchOption,
}).pipe(
  Command.withDescription("Show current head status"),
  Command.withHandler(({ json, url, watch }) =>
    withHead(url, (head) =>
      Effect.gen(function* () {
        const log = () =>
          Effect.logInfo(
            output(json, {
              headId: head.headId ?? "none",
              status: head.getState(),
            }),
          );
        if (watch) {
          yield* log().pipe(Effect.repeat(Schedule.spaced("1 second")));
        } else {
          yield* log();
        }
      }),
    ),
  ),
);

export const initCommand = Command.make("init", headOptions).pipe(
  Command.withDescription("Initialize a new Hydra head"),
  Command.withHandler(({ json, url }) =>
    withHead(url, (head) =>
      Effect.gen(function* () {
        yield* sendCommand(head, "Init");
        yield* Effect.logInfo(
          output(json, { result: "sent", command: "Init" }),
        );
      }),
    ),
  ),
);

export const abortCommand = Command.make("abort", headOptions).pipe(
  Command.withDescription("Abort head initialization"),
  Command.withHandler(({ json, url }) =>
    withHead(url, (head) =>
      Effect.gen(function* () {
        yield* sendCommand(head, "Abort");
        yield* Effect.logInfo(
          output(json, { result: "sent", command: "Abort" }),
        );
      }),
    ),
  ),
);

const commitUtxoOption = Options.text("utxo").pipe(
  Options.optional,
  Options.withDescription(
    "UTxO references to commit (comma-separated txhash#index). Requires --mnemonic and --blockfrost-key.",
  ),
);

const commitMnemonicOption = Options.text("mnemonic").pipe(
  Options.withFallbackConfig(configFallback("HYDRA_MNEMONIC", "mnemonic")),
  Options.optional,
  Options.withDescription(
    "BIP39 seed phrase. Falls back to HYDRA_MNEMONIC env var or config file.",
  ),
);

const commitBlockfrostKeyOption = Options.text("blockfrost-key").pipe(
  Options.withFallbackConfig(configFallback("HYDRA_BLOCKFROST_KEY", "blockfrostKey")),
  Options.optional,
  Options.withDescription(
    "Blockfrost project ID. Falls back to HYDRA_BLOCKFROST_KEY env var or config file.",
  ),
);

export const commitCommand = Command.make("commit", {
  ...headOptions,
  utxo: commitUtxoOption,
  mnemonic: commitMnemonicOption,
  blockfrostKey: commitBlockfrostKeyOption,
}).pipe(
  Command.withDescription(
    "Commit UTxOs to the head. Use --utxo with txhash#index refs, or omit for empty commit.",
  ),
  Command.withHandler(({ blockfrostKey: bfKeyOpt, json, mnemonic: mnemonicOpt, url, utxo: utxoOpt }) =>
    withHead(url, (head) =>
      Effect.gen(function* () {
        const utxoRefs =
          utxoOpt._tag === "Some" ? utxoOpt.value : undefined;
        const mnemonic =
          mnemonicOpt._tag === "Some" ? mnemonicOpt.value : undefined;
        const blockfrostKey =
          bfKeyOpt._tag === "Some" ? bfKeyOpt.value : undefined;

        if (!utxoRefs) {
          // Empty commit (fire-and-forget via WebSocket)
          yield* sendCommand(head, "Commit");
          yield* Effect.logInfo(
            output(json, { result: "sent", command: "Commit" }),
          );
          return;
        }

        if (!mnemonic || !blockfrostKey) {
          yield* Effect.logError(
            "Wallet commit requires --mnemonic and --blockfrost-key (or env vars).",
          );
          return;
        }

        const client = makeWalletClient(mnemonic, blockfrostKey);

        // 1. Fetch wallet UTxOs and match requested refs
        const allWalletUtxos = yield* Effect.tryPromise({
          try: () => client.getWalletUtxos(),
          catch: (e) =>
            new Head.HeadError({
              message: `Failed to fetch UTxOs: ${e instanceof Error ? e.message : String(e)}`,
            }),
        });

        const requestedRefs = utxoRefs.split(",").map((s) => s.trim());
        const selected: Array<UTxO.UTxO> = [];
        for (const ref of requestedRefs) {
          const found = allWalletUtxos.find(
            (u) => `${TransactionHash.toHex(u.transactionId)}#${u.index}` === ref,
          );
          if (!found) {
            yield* Effect.logError(`UTxO not found in wallet: ${ref}`);
            return;
          }
          selected.push(found);
        }

        yield* Effect.logInfo(
          `Committing ${selected.length} UTxO(s)...`,
        );

        // 2. Find a fee UTxO (not in selected, >= 2 ADA)
        const selectedRefSet = new Set(requestedRefs);
        const feeUtxo = allWalletUtxos.find(
          (u) =>
            !selectedRefSet.has(
              `${TransactionHash.toHex(u.transactionId)}#${u.index}`,
            ) && Assets.lovelaceOf(u.assets) >= 2_000_000n,
        );
        if (!feeUtxo) {
          yield* Effect.logError(
            "No unselected UTxO with >= 2 ADA available for fee coverage.",
          );
          return;
        }

        const allUtxos = [...selected, feeUtxo];

        // 3. Build blueprint TX
        const blueprintCbor = yield* Effect.tryPromise({
          try: async () => {
            const built = await client
              .newTx()
              .collectFrom({ inputs: allUtxos })
              .build();
            const tx = await built.toTransaction();
            return Transaction.toCBORHex(tx);
          },
          catch: (e) =>
            new Head.HeadError({
              message: `Failed to build blueprint TX: ${e instanceof Error ? e.message : String(e)}`,
            }),
        });

        // 4. POST /commit to hydra node
        const httpUrl = wsToHttp(url);
        const utxoMap = Provider.toHydraUtxoMap(allUtxos);
        const draftTx = yield* Provider.postCommit(httpUrl, {
          blueprintTx: {
            type: "Tx ConwayEra",
            description: "Ledger Cddl Format",
            cborHex: blueprintCbor,
          },
          utxo: utxoMap,
        }).pipe(
          Effect.mapError(
            (e) =>
              new Head.HeadError({
                message: `POST /commit failed: ${e.message}`,
              }),
          ),
        );

        const { cborHex: draftCborHex } = draftTx as {
          cborHex: string;
          txId: string;
        };
        yield* Effect.logInfo("Draft TX received from hydra node.");

        // 5. Sign draft TX (evolution-sdk preserves original CBOR bytes for hashing)
        const witnessSet = yield* Effect.tryPromise({
          try: () =>
            client.signTx(draftCborHex, { utxos: allUtxos }),
          catch: (e) =>
            new Head.HeadError({
              message: `Failed to sign TX: ${e instanceof Error ? e.message : String(e)}`,
            }),
        });
        const witnessHex = TransactionWitnessSet.toCBORHex(witnessSet);
        const signedCborHex = Transaction.addVKeyWitnessesHex(
          draftCborHex,
          witnessHex,
        );

        // 6. Submit raw CBOR to Blockfrost (provider submitTx re-encodes, so we submit directly)
        const txHash = yield* Effect.tryPromise({
          try: async () => {
            const res = await fetch(
              "https://cardano-preprod.blockfrost.io/api/v0/tx/submit",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/cbor",
                  project_id: blockfrostKey,
                },
                body: Buffer.from(signedCborHex, "hex"),
              },
            );
            if (!res.ok) {
              const text = await res.text();
              throw new Error(
                `Blockfrost submitTx failed. StatusCode: ${res.status} ${text}`,
              );
            }
            return res.json() as Promise<string>;
          },
          catch: (e) =>
            new Head.HeadError({
              message: `Failed to submit TX: ${e instanceof Error ? e.message : String(e)}`,
            }),
        });

        yield* Effect.logInfo(
          output(json, {
            result: "committed",
            command: "Commit",
            txHash: String(txHash),
            utxos: requestedRefs.join(","),
          }),
        );
      }),
    ),
  ),
);

export const closeCommand = Command.make("close", headOptions).pipe(
  Command.withDescription("Close the Hydra head"),
  Command.withHandler(({ json, url }) =>
    withHead(url, (head) =>
      Effect.gen(function* () {
        yield* sendCommand(head, "Close");
        yield* Effect.logInfo(
          output(json, { result: "sent", command: "Close" }),
        );
      }),
    ),
  ),
);

export const contestCommand = Command.make("contest", headOptions).pipe(
  Command.withDescription("Contest head closure with newer snapshot"),
  Command.withHandler(({ json, url }) =>
    withHead(url, (head) =>
      Effect.gen(function* () {
        yield* sendCommand(head, "Contest");
        yield* Effect.logInfo(
          output(json, { result: "sent", command: "Contest" }),
        );
      }),
    ),
  ),
);

export const fanoutCommand = Command.make("fanout", headOptions).pipe(
  Command.withDescription("Fan out from closed head to L1"),
  Command.withHandler(({ json, url }) =>
    withHead(url, (head) =>
      Effect.gen(function* () {
        yield* sendCommand(head, "Fanout");
        yield* Effect.logInfo(
          output(json, { result: "sent", command: "Fanout" }),
        );
      }),
    ),
  ),
);

const recoverTxIdOption = Options.text("tx-id").pipe(
  Options.withDescription("Transaction ID of the deposit to recover"),
);

export const recoverCommand = Command.make("recover", {
  ...headOptions,
  txId: recoverTxIdOption,
}).pipe(
  Command.withDescription("Recover a failed incremental commit deposit"),
  Command.withHandler(({ json, txId, url }) =>
    withHead(url, (head) =>
      Effect.gen(function* () {
        yield* sendCommand(head, "Recover", { recoverTxId: txId });
        yield* Effect.logInfo(
          output(json, { result: "sent", command: "Recover", txId }),
        );
      }),
    ),
  ),
);

const decommitCborOption = Options.text("tx-cbor").pipe(
  Options.withDescription("CBOR hex of the decommit transaction"),
);

const decommitTxIdOption = Options.text("tx-id").pipe(
  Options.withDescription("Transaction ID of the decommit transaction"),
);

export const decommitCommand = Command.make("decommit", {
  ...headOptions,
  txCbor: decommitCborOption,
  txId: decommitTxIdOption,
}).pipe(
  Command.withDescription("Decommit UTxOs from head back to L1"),
  Command.withHandler(({ json, txCbor, txId, url }) =>
    withHead(url, (head) =>
      Effect.gen(function* () {
        yield* sendCommand(head, "Decommit", {
          cborHex: txCbor,
          description: "Ledger Cddl Format",
          txId,
          type: "Tx ConwayEra",
        });
        yield* Effect.logInfo(
          output(json, { result: "sent", command: "Decommit" }),
        );
      }),
    ),
  ),
);

export const connectCommand = Command.make("connect", headOptions).pipe(
  Command.withDescription("Test connection to a Hydra node"),
  Command.withHandler(({ json, url }) =>
    withHead(url, (head) =>
      Effect.gen(function* () {
        yield* Effect.logInfo(
          output(json, {
            headId: head.headId ?? "none",
            result: "connected",
            status: head.getState(),
            url,
          }),
        );
      }),
    ),
  ),
);

// ---------------------------------------------------------------------------
// UTxO listing commands
// ---------------------------------------------------------------------------

export const l1UtxoCommand = Command.make("l1-utxo", {
  ...headOptions,
  ...walletOptions,
}).pipe(
  Command.withDescription("List L1 wallet UTxOs"),
  Command.withHandler(({ blockfrostKey, json, mnemonic }) =>
    Effect.gen(function* () {
      const client = makeWalletClient(mnemonic, blockfrostKey);
      const utxos = yield* Effect.tryPromise({
        try: () => client.getWalletUtxos(),
        catch: (e) =>
          new Head.HeadError({
            message: `Failed to fetch UTxOs: ${e instanceof Error ? e.message : String(e)}`,
          }),
      });

      if (json) {
        const entries = utxos.map((u) => ({
          ref: `${TransactionHash.toHex(u.transactionId)}#${u.index}`,
          lovelace: Number(Assets.lovelaceOf(u.assets)),
          assets: Assets.flatten(u.assets).map(([pid, name, qty]) => ({
            policyId: PolicyId.toHex(pid),
            assetName: AssetName.toHex(name),
            quantity: Number(qty),
          })),
        }));
        yield* Effect.logInfo(JSON.stringify(entries, null, 2));
      } else {
        yield* Effect.logInfo(`Found ${utxos.length} L1 UTxO(s):\n`);
        for (const u of utxos) {
          yield* Effect.logInfo(`  ${formatUtxo(u)}`);
        }
      }
    }).pipe(
      Effect.catchTag("HeadError", (e) =>
        Effect.logError(`Error: ${e.message}`),
      ),
    ),
  ),
);

export const l2UtxoCommand = Command.make("l2-utxo", headOptions).pipe(
  Command.withDescription("List L2 UTxOs in the Hydra head snapshot"),
  Command.withHandler(({ json, url }) =>
    Effect.gen(function* () {
      const httpUrl = wsToHttp(url);
      const utxoMap = yield* Provider.getSnapshotUtxo(httpUrl).pipe(
        Effect.mapError(
          (e) =>
            new Head.HeadError({
              message: `Failed to fetch L2 UTxOs: ${e.message}`,
            }),
        ),
      );

      const entries = Object.entries(utxoMap);

      if (json) {
        yield* Effect.logInfo(JSON.stringify(utxoMap, null, 2));
      } else {
        yield* Effect.logInfo(`Found ${entries.length} L2 UTxO(s):\n`);
        for (const [ref, txOut] of entries) {
          const lovelace = BigInt(
            (txOut as Record<string, unknown> & { value: { lovelace: number } })
              .value.lovelace,
          );
          yield* Effect.logInfo(`  ${ref} — ${formatAda(lovelace)}`);
        }
      }
    }).pipe(
      Effect.catchTag("HeadError", (e) =>
        Effect.logError(`Error: ${e.message}`),
      ),
    ),
  ),
);

// ---------------------------------------------------------------------------
// Config Commands
// ---------------------------------------------------------------------------

const configKeyArg = Options.text("key").pipe(
  Options.withDescription(
    "Config key (url, mnemonic, blockfrostKey, network)",
  ),
);

const configValueArg = Options.text("value").pipe(
  Options.withDescription("Value to set"),
);

export const configSetCommand = Command.make("set", {
  key: configKeyArg,
  value: configValueArg,
}).pipe(
  Command.withDescription("Set a config value"),
  Command.withHandler(({ key, value }) =>
    Effect.gen(function* () {
      if (!HydraConfig.isValidKey(key)) {
        yield* Effect.logError(
          `Invalid key: ${key}. Valid keys: url, mnemonic, blockfrostKey, network`,
        );
        return;
      }
      HydraConfig.set(key, value);
      yield* Effect.logInfo(`Set ${key} = ${key === "mnemonic" ? "***" : value}`);
    }),
  ),
);

export const configGetCommand = Command.make("get", {
  key: configKeyArg,
}).pipe(
  Command.withDescription("Get a config value"),
  Command.withHandler(({ key }) =>
    Effect.gen(function* () {
      if (!HydraConfig.isValidKey(key)) {
        yield* Effect.logError(
          `Invalid key: ${key}. Valid keys: url, mnemonic, blockfrostKey, network`,
        );
        return;
      }
      const value = HydraConfig.get(key);
      yield* Effect.logInfo(value ?? "(not set)");
    }),
  ),
);

export const configListCommand = Command.make("list", {}).pipe(
  Command.withDescription("List all config values"),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const config = HydraConfig.load();
      const entries = Object.entries(config);
      if (entries.length === 0) {
        yield* Effect.logInfo("(empty config)");
        return;
      }
      for (const [k, v] of entries) {
        yield* Effect.logInfo(`${k}: ${k === "mnemonic" ? "***" : v}`);
      }
    }),
  ),
);

export const configPathCommand = Command.make("path", {}).pipe(
  Command.withDescription("Show config file path"),
  Command.withHandler(() => Effect.logInfo(HydraConfig.configPath())),
);

export const configRemoveCommand = Command.make("remove", {
  key: configKeyArg,
}).pipe(
  Command.withDescription("Remove a config value"),
  Command.withHandler(({ key }) =>
    Effect.gen(function* () {
      if (!HydraConfig.isValidKey(key)) {
        yield* Effect.logError(
          `Invalid key: ${key}. Valid keys: url, mnemonic, blockfrostKey, network`,
        );
        return;
      }
      HydraConfig.remove(key);
      yield* Effect.logInfo(`Removed ${key}`);
    }),
  ),
);

export const configCommand = Command.make("config").pipe(
  Command.withDescription("Manage CLI configuration"),
  Command.withSubcommands([
    configSetCommand,
    configGetCommand,
    configListCommand,
    configPathCommand,
    configRemoveCommand,
  ]),
);

// ---------------------------------------------------------------------------
// Root Command
// ---------------------------------------------------------------------------

export const rootCommand = Command.make("hydra").pipe(
  Command.withDescription("Hydra head lifecycle manager"),
  Command.withSubcommands([
    statusCommand,
    initCommand,
    abortCommand,
    commitCommand,
    closeCommand,
    contestCommand,
    fanoutCommand,
    recoverCommand,
    decommitCommand,
    connectCommand,
    l1UtxoCommand,
    l2UtxoCommand,
    configCommand,
  ]),
);

export const runCli = Command.run(rootCommand, {
  name: "hydra",
  version: "0.1.0",
});
