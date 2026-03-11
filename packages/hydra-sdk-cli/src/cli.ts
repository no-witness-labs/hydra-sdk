import * as Command from "@effect/cli/Command";
import * as Options from "@effect/cli/Options";
import type { UTxO } from "@evolution-sdk/evolution";
import {
  AssetName,
  Assets,
  Bip32PrivateKey,
  createClient,
  PolicyId,
  PrivateKey,
  Transaction,
  TransactionHash,
  TransactionWitnessSet,
} from "@evolution-sdk/evolution";
import { Head, Provider } from "@no-witness-labs/hydra-sdk";
import { blake2b } from "@noble/hashes/blake2b";
import { mnemonicToEntropy } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { Config, Duration, Effect, Schedule } from "effect";

// ---------------------------------------------------------------------------
// Global Options (shared by all commands that need a head connection)
// ---------------------------------------------------------------------------

const urlOption = Options.text("url").pipe(
  Options.withFallbackConfig(Config.string("HYDRA_NODE_URL")),
  Options.withDescription(
    "Hydra node WebSocket URL (e.g. ws://localhost:4001). Falls back to HYDRA_NODE_URL env var.",
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

/**
 * Extract the raw body bytes from a Cardano TX CBOR hex string.
 * A TX is a 4-element CBOR array [body, witnessSet, isValid, auxiliaryData].
 * We must extract the original bytes to avoid re-encoding (which can change
 * the hash and break script integrity checks).
 */
const extractBodyBytes = (txHex: string): Uint8Array => {
  const bytes = Buffer.from(txHex, "hex");
  // Skip the outer array tag (0x84 = 4-element array)
  let offset = 1;
  const bodyStart = offset;
  offset = skipCborItem(bytes, offset);
  return bytes.subarray(bodyStart, offset);
};

/** Skip one complete CBOR item and return the offset after it. */
const skipCborItem = (buf: Buffer, offset: number): number => {
  const major = buf[offset] >> 5;
  const additional = buf[offset] & 0x1f;
  offset++;

  let length: number;
  if (additional < 24) {
    length = additional;
  } else if (additional === 24) {
    length = buf[offset++];
  } else if (additional === 25) {
    length = buf.readUInt16BE(offset);
    offset += 2;
  } else if (additional === 26) {
    length = buf.readUInt32BE(offset);
    offset += 4;
  } else if (additional === 27) {
    length = Number(buf.readBigUInt64BE(offset));
    offset += 8;
  } else if (additional === 31) {
    if (major === 2 || major === 3) {
      while (buf[offset] !== 0xff) offset = skipCborItem(buf, offset);
      return offset + 1;
    }
    while (buf[offset] !== 0xff) {
      offset = skipCborItem(buf, offset);
      if (major === 5) offset = skipCborItem(buf, offset);
    }
    return offset + 1;
  } else {
    throw new Error(`Unsupported CBOR additional info: ${additional}`);
  }

  if (major === 0 || major === 1 || major === 7) return offset;
  if (major === 2 || major === 3) return offset + length;
  if (major === 4) {
    for (let i = 0; i < length; i++) offset = skipCborItem(buf, offset);
    return offset;
  }
  if (major === 5) {
    for (let i = 0; i < length; i++) {
      offset = skipCborItem(buf, offset);
      offset = skipCborItem(buf, offset);
    }
    return offset;
  }
  if (major === 6) return skipCborItem(buf, offset);
  throw new Error(`Unsupported CBOR major type: ${major}`);
};

/**
 * Sign a draft TX preserving the original CBOR bytes.
 * Uses BIP32-Ed25519 derivation (same as createClient with seed wallet).
 */
const signDraftTx = (draftCborHex: string, mnemonic: string): string => {
  // 1. Derive payment key via BIP32-Ed25519 (matches createClient seed wallet)
  const entropy = mnemonicToEntropy(mnemonic, wordlist);
  const rootXPrv = Bip32PrivateKey.fromBip39Entropy(entropy, "");
  const paymentNode = Bip32PrivateKey.derive(
    rootXPrv,
    Bip32PrivateKey.CardanoPath.paymentIndices(0, 0),
  );
  const paymentKey = Bip32PrivateKey.toPrivateKey(paymentNode);

  // 2. Hash the ORIGINAL body bytes (preserves hydra-node encoding)
  const bodyBytes = extractBodyBytes(draftCborHex);
  const bodyHash = blake2b(bodyBytes, { dkLen: 32 });

  // 3. Sign and build witness set
  const signature = PrivateKey.sign(paymentKey, bodyHash);
  const vkey = PrivateKey.toPublicKey(paymentKey);
  const witnessSet = TransactionWitnessSet.fromVKeyWitnesses([
    new TransactionWitnessSet.VKeyWitness({ vkey, signature }),
  ]);
  return TransactionWitnessSet.toCBORHex(witnessSet);
};

/** Shared wallet options for commands that need L1 wallet access. */
const walletOptions = {
  mnemonic: Options.text("mnemonic").pipe(
    Options.withFallbackConfig(Config.string("HYDRA_MNEMONIC")),
    Options.withDescription(
      "BIP39 seed phrase. Falls back to HYDRA_MNEMONIC env var.",
    ),
  ),
  blockfrostKey: Options.text("blockfrost-key").pipe(
    Options.withFallbackConfig(Config.string("HYDRA_BLOCKFROST_KEY")),
    Options.withDescription(
      "Blockfrost project ID. Falls back to HYDRA_BLOCKFROST_KEY env var.",
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
  Options.withFallbackConfig(Config.string("HYDRA_MNEMONIC")),
  Options.optional,
  Options.withDescription(
    "BIP39 seed phrase. Falls back to HYDRA_MNEMONIC env var.",
  ),
);

const commitBlockfrostKeyOption = Options.text("blockfrost-key").pipe(
  Options.withFallbackConfig(Config.string("HYDRA_BLOCKFROST_KEY")),
  Options.optional,
  Options.withDescription(
    "Blockfrost project ID. Falls back to HYDRA_BLOCKFROST_KEY env var.",
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

        // 5. Sign draft TX (byte-level: preserves original CBOR from hydra-node)
        const witnessHex = signDraftTx(draftCborHex, mnemonic);
        const signedCborHex = Transaction.addVKeyWitnessesHex(
          draftCborHex,
          witnessHex,
        );

        // 6. Submit raw CBOR to Blockfrost (avoids re-encoding)
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
  ]),
);

export const runCli = Command.run(rootCommand, {
  name: "hydra",
  version: "0.1.0",
});
