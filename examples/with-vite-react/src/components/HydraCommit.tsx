import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Head } from "@no-witness-labs/hydra-sdk";
import {
  Address,
  Assets,
  CBOR,
  createClient,
  Transaction,
  TransactionHash,
  TransactionWitnessSet,
  UTxO,
} from "@evolution-sdk/evolution";
import { decodeHexAddress } from "@cardano-foundation/cardano-connect-with-wallet-core";

type HeadStatus = Head.HeadStatus;

interface Props {
  walletApi: CardanoWalletApi;
}

interface LogEntry {
  ts: number;
  tag: string;
  payload?: unknown;
}

interface ParsedUtxo {
  txHash: string;
  index: number;
  addressHex: string;
  lovelace: bigint;
  assets: Array<{ policyId: string; assetName: string; quantity: bigint }>;
  /** Datum hash hex (32 bytes) if present on the output. */
  datumHash: string | null;
  /** Inline datum as raw CBOR hex, if present. */
  inlineDatumCbor: string | null;
  /** Reference script as raw CBOR hex, if present. */
  referenceScriptCbor: string | null;
  raw: string;
}

const HYDRA_URL = import.meta.env.VITE_HYDRA_NODE_URL as string | undefined;

/** Derive the HTTP base URL from a ws:// or wss:// URL. */
function wsToHttp(wsUrl: string): string {
  return wsUrl.replace(/^ws(s?):\/\//, "http$1://");
}

/** Check if url uses mock transport. */
function isMock(wsUrl: string): boolean {
  return wsUrl.startsWith("mock://");
}

/** Convert Uint8Array to hex string. */
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Decode a CIP-30 TransactionUnspentOutput CBOR hex string. */
function parseUtxoHex(hex: string): ParsedUtxo {
  try {
    // CIP-30 TransactionUnspentOutput = [TransactionInput, TransactionOutput]
    const decoded = CBOR.fromCBORHex(hex);
    if (!Array.isArray(decoded) || decoded.length < 2) {
      throw new Error("Expected CBOR array(2)");
    }

    // TransactionInput: [txHash(bytes32), index(uint)]
    const input = decoded[0] as ReadonlyArray<CBOR.CBOR>;
    const txHash =
      input[0] instanceof Uint8Array ? toHex(input[0]) : "";
    const index =
      typeof input[1] === "bigint" ? Number(input[1]) : 0;

    // TransactionOutput: array (Shelley) or record/map (Babbage/Conway)
    const output = decoded[1];
    let lovelace = 0n;
    let addressHex = "";
    const assets: ParsedUtxo["assets"] = [];

    // Extract address, value, datum option (key 2), and script ref (key 3)
    let addressCbor: CBOR.CBOR | undefined;
    let valueCbor: CBOR.CBOR | undefined;
    let datumOptionCbor: CBOR.CBOR | undefined;
    let scriptRefCbor: CBOR.CBOR | undefined;
    if (Array.isArray(output)) {
      // Shelley format: [address, value, datumHash?]
      addressCbor = output[0];
      valueCbor = output[1];
      // Shelley outputs can have an optional datum hash at index 2
      if (output[2] instanceof Uint8Array) datumOptionCbor = output[2];
    } else if (output instanceof Map) {
      // Babbage/Conway as Map
      addressCbor = output.get(0n) ?? output.get(0);
      valueCbor = output.get(1n) ?? output.get(1);
      datumOptionCbor = output.get(2n) ?? output.get(2);
      scriptRefCbor = output.get(3n) ?? output.get(3);
    } else if (output && typeof output === "object" && !("_tag" in output)) {
      // Babbage/Conway as Record {0: address, 1: value, 2: datumOption, 3: scriptRef}
      const rec = output as Record<string | number, CBOR.CBOR>;
      addressCbor = rec[0];
      valueCbor = rec[1];
      datumOptionCbor = rec[2];
      scriptRefCbor = rec[3];
    }

    if (addressCbor instanceof Uint8Array) {
      addressHex = toHex(addressCbor);
    }

    // Parse datum option: Conway/Babbage uses [0, hash] for datum hash or [1, datum] for inline datum
    let datumHash: string | null = null;
    let inlineDatumCbor: string | null = null;
    if (datumOptionCbor instanceof Uint8Array) {
      // Shelley-style raw datum hash (32 bytes)
      datumHash = toHex(datumOptionCbor);
    } else if (Array.isArray(datumOptionCbor) && datumOptionCbor.length === 2) {
      const tag = datumOptionCbor[0];
      const val = datumOptionCbor[1];
      if (tag === 0n || tag === 0) {
        // [0, hash] = datum hash
        if (val instanceof Uint8Array) datumHash = toHex(val);
      } else if (tag === 1n || tag === 1) {
        // [1, datum] = inline datum — encode back to CBOR hex
        inlineDatumCbor = CBOR.toCBORHex(val as CBOR.CBOR);
      }
    }

    // Parse reference script
    let referenceScriptCbor: string | null = null;
    if (scriptRefCbor !== undefined && scriptRefCbor !== null) {
      // Encode the script ref back to CBOR hex for the Hydra API
      referenceScriptCbor = CBOR.toCBORHex(scriptRefCbor as CBOR.CBOR);
    }

    if (valueCbor !== undefined) {
      if (typeof valueCbor === "bigint") {
        lovelace = valueCbor;
      } else if (Array.isArray(valueCbor) && valueCbor.length >= 2) {
        // [lovelace, multiasset]
        if (typeof valueCbor[0] === "bigint") lovelace = valueCbor[0];

        const multiAsset = valueCbor[1];
        const entries: Iterable<[CBOR.CBOR, CBOR.CBOR]> =
          multiAsset instanceof Map
            ? multiAsset.entries()
            : typeof multiAsset === "object" && multiAsset !== null
              ? Object.entries(multiAsset as Record<string, CBOR.CBOR>)
              : [];

        for (const [policyKey, assetMap] of entries) {
          const policyId =
            policyKey instanceof Uint8Array ? toHex(policyKey) : String(policyKey);

          const assetEntries: Iterable<[CBOR.CBOR, CBOR.CBOR]> =
            assetMap instanceof Map
              ? assetMap.entries()
              : typeof assetMap === "object" && assetMap !== null
                ? Object.entries(assetMap as Record<string, CBOR.CBOR>)
                : [];

          for (const [nameKey, qty] of assetEntries) {
            const assetName =
              nameKey instanceof Uint8Array ? tryUtf8(nameKey) : String(nameKey);
            const quantity = typeof qty === "bigint" ? qty : 0n;
            assets.push({ policyId, assetName, quantity });
          }
        }
      }
    }

    return { txHash, index, addressHex, lovelace, assets, datumHash, inlineDatumCbor, referenceScriptCbor, raw: hex };
  } catch {
    return { txHash: hex.slice(0, 64), index: 0, addressHex: "", lovelace: 0n, assets: [], datumHash: null, inlineDatumCbor: null, referenceScriptCbor: null, raw: hex };
  }
}

/** Try to decode bytes as UTF-8, fall back to hex. */
function tryUtf8(bytes: Uint8Array): string {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    // Only use UTF-8 if it looks like readable text
    if (/^[\x20-\x7e]+$/.test(text)) return text;
    return toHex(bytes);
  } catch {
    return toHex(bytes);
  }
}

/** Format lovelace as ADA with 6 decimal places. */
function formatAda(lovelace: bigint): string {
  const ada = Number(lovelace) / 1_000_000;
  return ada.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/**
 * Convert inline datum CBOR hex to Hydra-compatible JSON.
 * Decodes the CBOR and produces a JSON representation matching
 * what CML's PlutusData.to_json() would produce.
 */
function inlineDatumToJson(cborHex: string): unknown {
  try {
    const decoded = CBOR.fromCBORHex(cborHex);
    return cborToPlutusJson(decoded);
  } catch {
    return cborHex;
  }
}

/** Recursively convert a decoded CBOR value to Plutus JSON format. */
function cborToPlutusJson(val: CBOR.CBOR): unknown {
  if (typeof val === "bigint") return { int: Number(val) };
  if (typeof val === "number") return { int: val };
  if (typeof val === "string") return { bytes: val };
  if (val instanceof Uint8Array) return { bytes: toHex(val) };
  if (Array.isArray(val)) return { list: val.map(cborToPlutusJson) };
  if (val instanceof Map) {
    const entries: Array<{ k: unknown; v: unknown }> = [];
    for (const [k, v] of val.entries()) {
      entries.push({ k: cborToPlutusJson(k as CBOR.CBOR), v: cborToPlutusJson(v as CBOR.CBOR) });
    }
    return { map: entries };
  }
  // CBOR tagged value (constructor)
  if (val && typeof val === "object" && "_tag" in val) {
    const tagged = val as { _tag: string; tag: number; value: CBOR.CBOR };
    if (tagged._tag === "CborTag") {
      // Plutus constructor: tag 121+n for constructor index n (0-6)
      // or tag 1280+n for constructor index 7+
      const idx = tagged.tag >= 1280 ? tagged.tag - 1280 : tagged.tag - 121;
      const fields = Array.isArray(tagged.value)
        ? tagged.value.map(cborToPlutusJson)
        : [cborToPlutusJson(tagged.value)];
      return { constructor: idx, fields };
    }
  }
  return val;
}

/** Build a Hydra-compatible UTxO map from selected parsed UTxOs (blueprint format). */
function buildHydraUtxoMap(
  selected: Array<ParsedUtxo>,
): Record<string, Record<string, unknown>> {
  const utxoMap: Record<string, Record<string, unknown>> = {};
  for (const u of selected) {
    const key = `${u.txHash}#${u.index}`;
    const bech32Addr = u.addressHex ? decodeHexAddress(u.addressHex) : "";

    // Build value object
    const value: Record<string, unknown> = { lovelace: Number(u.lovelace) };
    for (const asset of u.assets) {
      if (!value[asset.policyId]) value[asset.policyId] = {};
      (value[asset.policyId] as Record<string, number>)[asset.assetName] =
        Number(asset.quantity);
    }

    // Match reference format: inlineDatum (JSON), inlineDatumRaw (CBOR hex), inlineDatumhash
    utxoMap[key] = {
      address: bech32Addr,
      datum: null,
      inlineDatum: u.inlineDatumCbor ? inlineDatumToJson(u.inlineDatumCbor) : null,
      inlineDatumRaw: u.inlineDatumCbor ?? null,
      inlineDatumhash: u.datumHash ?? null,
      referenceScript: null,
      value,
    };
  }
  return utxoMap;
}


/**
 * Build a blueprint transaction CBOR hex using evolution-sdk's transaction builder.
 *
 * Uses createClient + newTx() to produce proper Conway-era transaction CBOR
 * that the hydra-node uses to construct the actual commit transaction.
 */
async function buildBlueprintTxCbor(
  selected: Array<ParsedUtxo>,
  changeAddress: string,
  walletApi: CardanoWalletApi,
): Promise<string> {
  const parsedAddress = Address.fromBech32(changeAddress);
  const utxoInputs = selected.map((u) => {
    let assets = Assets.fromLovelace(u.lovelace);
    for (const asset of u.assets) {
      assets = Assets.addByHex(assets, asset.policyId, asset.assetName, asset.quantity);
    }
    return new UTxO.UTxO({
      transactionId: TransactionHash.fromHex(u.txHash),
      index: BigInt(u.index),
      address: u.addressHex ? Address.fromHex(u.addressHex) : parsedAddress,
      assets,
    });
  });

  const blockfrostKey = import.meta.env.VITE_BLOCKFROST_KEY_PREPROD as string;
  const client = createClient({
    network: "preprod",
    provider: {
      type: "blockfrost",
      baseUrl: "https://cardano-preprod.blockfrost.io/api/v0",
      projectId: blockfrostKey,
    },
    wallet: { type: "api" as const, api: walletApi as never },
  });

  const built = await client
    .newTx()
    .collectFrom({ inputs: utxoInputs })
    .build({ availableUtxos: [] });

  const tx = await built.toTransaction();
  const cborHex = Transaction.toCBORHex(tx);

  console.log("[Blueprint TX] inputs:", tx.body.inputs.length, "outputs:", tx.body.outputs.length, "fee:", tx.body.fee.toString());
  console.log("[Blueprint TX] scriptDataHash:", tx.body.scriptDataHash ?? "none");
  return cborHex;
}

/**
 * Merge wallet witness set into a draft transaction using evolution-sdk.
 * Parses both tx and witness with evolution-sdk, merges vkey witnesses,
 * and re-serializes.
 */
function mergeTxWitnesses(draftTxHex: string, walletWitnessHex: string): string {
  const draftTx = Transaction.fromCBORHex(draftTxHex);
  const walletWitness = TransactionWitnessSet.fromCBORHex(walletWitnessHex);

  // Merge vkey witnesses from wallet into draft tx's witness set
  const existingVkeys = draftTx.witnessSet.vkeyWitnesses ?? [];
  const walletVkeys = walletWitness.vkeyWitnesses ?? [];
  const mergedVkeys = [...existingVkeys, ...walletVkeys];

  const mergedWitnessSet = new TransactionWitnessSet.TransactionWitnessSet({
    ...draftTx.witnessSet,
    vkeyWitnesses: mergedVkeys.length > 0 ? mergedVkeys : undefined,
  });

  const mergedTx = new Transaction.Transaction({
    body: draftTx.body,
    witnessSet: mergedWitnessSet,
    isValid: draftTx.isValid,
    auxiliaryData: draftTx.auxiliaryData,
  });

  return Transaction.toCBORHex(mergedTx);
}

/**
 * Valid actions per FSM state. Buttons are disabled unless the current
 * state is listed for the action.
 */
const ALLOWED: Record<string, ReadonlySet<HeadStatus>> = {
  init: new Set(["Idle"]),
  commit: new Set(["Initializing"]),
  close: new Set(["Open"]),
  fanout: new Set(["FanoutPossible"]),
  abort: new Set(["Idle", "Initializing"]),
};

export default function HydraCommit({ walletApi }: Props) {
  const [url, setUrl] = useState(HYDRA_URL ?? "mock://test");
  const [head, setHead] = useState<Head.HydraHead | null>(null);
  const [status, setStatus] = useState<HeadStatus>("Idle");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [utxos, setUtxos] = useState<string[] | null>(null);
  const [selectedUtxos, setSelectedUtxos] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [contestationDeadline, setContestationDeadline] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState<string | null>(null);

  const headRef = useRef<Head.HydraHead | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll event log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Countdown timer for contestation period
  useEffect(() => {
    if (!contestationDeadline) return;
    const tick = () => {
      const remaining = contestationDeadline.getTime() - Date.now();
      if (remaining <= 0) {
        setCountdown(null);
        setContestationDeadline(null);
        return;
      }
      const mins = Math.floor(remaining / 60_000);
      const secs = Math.floor((remaining % 60_000) / 1000);
      setCountdown(`${mins}:${secs.toString().padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [contestationDeadline]);

  const appendLog = useCallback((tag: string, payload?: unknown) => {
    setLogs((prev) => [...prev, { ts: Date.now(), tag, payload }]);
  }, []);

  // -- Connect / Disconnect to Hydra node ------------------------------------

  const handleConnect = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const h = await Head.create({ url });
      headRef.current = h;
      setHead(h);
      appendLog("Connected", { url });

      // Subscribe to future events.
      h.subscribe((event) => {
        appendLog(event.tag, event.payload);
        setStatus(h.getState());

        // Capture contestation deadline from HeadIsClosed event
        const p = event.payload as Record<string, unknown> | undefined;
        if (event.tag === "HeadIsClosed" && p?.contestationDeadline) {
          setContestationDeadline(new Date(p.contestationDeadline as string));
        }
        // Clear deadline when head transitions past Closed
        if (event.tag === "ReadyToFanout" || event.tag === "HeadIsFinalized") {
          setContestationDeadline(null);
          setCountdown(null);
        }
      });

      // Poll getState() until it changes from Idle (Greetings syncs the real
      // state) or until we've waited long enough.
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 200));
        const s = h.getState();
        setStatus(s);
        if (s !== "Idle") break;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [url, appendLog]);

  const handleDisconnect = useCallback(async () => {
    if (!headRef.current) return;
    await headRef.current.dispose();
    headRef.current = null;
    setHead(null);
    setStatus("Idle");
    setUtxos(null);
    appendLog("Disconnected");
  }, [appendLog]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      headRef.current?.dispose();
    };
  }, []);

  // -- Lifecycle actions ------------------------------------------------------

  const run = useCallback(
    async (label: string, fn: () => Promise<void>) => {
      setError(null);
      setBusy(true);
      setBusyLabel(label);
      try {
        await fn();
        if (headRef.current) setStatus(headRef.current.getState());
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
        setBusyLabel(null);
      }
    },
    [],
  );

  const parsedUtxos = useMemo(
    () => utxos?.map(parseUtxoHex) ?? [],
    [utxos],
  );

  const handleInit = useCallback(
    () => run("Initializing head on L1...", () => head!.init()),
    [head, run],
  );

  const handleCommit = useCallback(
    () =>
      run("Committing to head...", async () => {
        if (isMock(url)) {
          await head!.commit(utxos ?? []);
          return;
        }

        const httpBase = wsToHttp(url);
        const commitUrl = import.meta.env.DEV
          ? "/hydra/commit"
          : `${httpBase}/commit`;

        // Build commit payload from selected UTxOs
        const selected = parsedUtxos.filter((_, i) => selectedUtxos.has(i));
        const hasWalletUtxos = selected.length > 0;

        // Build blueprint commit request body
        let commitBody: unknown;
        if (hasWalletUtxos) {
          const changeAddress = selected[0]!.addressHex
            ? decodeHexAddress(selected[0]!.addressHex)
            : "";

          appendLog("BuildingBlueprintTx");
          const blueprintCbor = await buildBlueprintTxCbor(selected, changeAddress, walletApi);
          const utxoMap = buildHydraUtxoMap(selected);

          commitBody = {
            blueprintTx: {
              type: "Tx ConwayEra",
              description: "Ledger Cddl Format",
              cborHex: blueprintCbor,
            },
            utxo: utxoMap,
          };
        } else {
          // Empty commit (no UTxOs)
          commitBody = {};
        }

        // Log full commit request for debugging
        console.log("[Commit] Full request body:", JSON.stringify(commitBody, null, 2));

        appendLog("CommitRequest", {
          endpoint: commitUrl,
          utxoCount: selected.length,
          format: hasWalletUtxos ? "blueprint" : "empty",
        });

        // 1. POST blueprint commit to Hydra → draft commit tx
        const res = await fetch(commitUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(commitBody),
        });

        if (!res.ok) {
          const body = await res.text();
          throw new Error(`POST /commit failed (${res.status}): ${body}`);
        }

        const draftTx = (await res.json()) as { cborHex: string; txId: string };
        appendLog("DraftTxReceived", { txId: draftTx.txId });

        let finalTxHex = draftTx.cborHex;

        if (hasWalletUtxos) {
          // 2. Ask wallet to sign (partial=true, since hydra-node already signed)
          appendLog("RequestingWalletSignature");
          const walletWitnessHex = await walletApi.signTx(
            draftTx.cborHex,
            true,
          );
          appendLog("WalletSigned");

          // 3. Merge wallet witnesses into the draft tx
          finalTxHex = mergeTxWitnesses(draftTx.cborHex, walletWitnessHex);
          appendLog("WitnessesMerged");
        }

        // 4. Submit the final tx to Cardano L1
        appendLog("SubmittingTx", { txLen: finalTxHex.length });
        try {
          const submittedTxId = await walletApi.submitTx(finalTxHex);
          appendLog("TxSubmitted", { txId: submittedTxId });
        } catch (submitErr: unknown) {
          appendLog("SubmitFailed", {
            error: String(submitErr),
            detail: JSON.stringify(submitErr),
          });
          throw submitErr;
        }
      }),
    [head, url, utxos, parsedUtxos, selectedUtxos, walletApi, run, appendLog],
  );

  const handleClose = useCallback(
    () => run("Closing head on L1...", () => head!.close()),
    [head, run],
  );

  const handleFanout = useCallback(
    () => run("Fanning out on L1...", () => head!.fanout()),
    [head, run],
  );

  const handleAbort = useCallback(
    () => run("Aborting head on L1...", () => head!.abort()),
    [head, run],
  );

  // -- Fetch UTxOs from wallet ------------------------------------------------

  const handleFetchUtxos = useCallback(async () => {
    setError(null);
    try {
      const result = await walletApi.getUtxos();
      setUtxos(result ?? []);
      setSelectedUtxos(new Set());
      appendLog("FetchedUTxOs", { count: result?.length ?? 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [walletApi, appendLog]);

  const toggleUtxo = useCallback((idx: number) => {
    setSelectedUtxos((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const toggleAllUtxos = useCallback(() => {
    if (!utxos) return;
    setSelectedUtxos((prev) =>
      prev.size === utxos.length
        ? new Set()
        : new Set(utxos.map((_, i) => i)),
    );
  }, [utxos]);

  // -- Render -----------------------------------------------------------------

  const can = (action: string) => !busy && head && ALLOWED[action]?.has(status);

  return (
    <section className="space-y-4 rounded-lg border border-gray-800 bg-gray-900 p-5">
      <h2 className="text-lg font-medium">Hydra Head</h2>

      {/* Note about commit */}
      <p className="rounded bg-yellow-900/30 px-3 py-2 text-xs text-yellow-300">
        <strong>Note:</strong> With <code>mock://</code> the full lifecycle
        works instantly. With a real <code>ws://</code> node, Commit calls{" "}
        <code>POST /commit</code>, then asks your wallet to sign &amp; submit
        the draft tx on-chain.
      </p>

      {/* Connection */}
      {!head ? (
        <div className="flex items-end gap-2">
          <label className="flex-1">
            <span className="mb-1 block text-sm text-gray-400">
              Hydra Node URL
            </span>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="ws://localhost:4001 or mock://test"
              className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </label>
          <button
            onClick={handleConnect}
            disabled={busy || !url}
            className="rounded bg-indigo-600 px-4 py-1.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            Connect
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <span className="inline-block h-2 w-2 rounded-full bg-green-400" />
            <span className="text-gray-400">
              Connected to <code className="text-gray-300">{url}</code>
            </span>
          </div>
          <button
            onClick={handleDisconnect}
            className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium hover:bg-red-700"
          >
            Disconnect
          </button>
        </div>
      )}

      {/* Status + Loading */}
      {head && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">State:</span>
          <span className="rounded bg-gray-800 px-2 py-0.5 text-sm font-mono font-medium">
            {status}
          </span>
          {countdown && (status === "Closed" || status === "FanoutPossible") && (
            <span className="rounded bg-amber-900/40 px-2 py-0.5 text-sm font-mono text-amber-300">
              Fanout in {countdown}
            </span>
          )}
          {busyLabel && (
            <span className="flex items-center gap-2 text-sm text-yellow-300">
              <svg
                className="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              {busyLabel}
            </span>
          )}
        </div>
      )}

      {/* Actions */}
      {head && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleInit}
            disabled={!can("init")}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-30"
          >
            Init
          </button>
          <button
            onClick={handleFetchUtxos}
            disabled={busy}
            className="rounded bg-teal-600 px-3 py-1.5 text-sm font-medium hover:bg-teal-700 disabled:opacity-30"
          >
            Fetch UTxOs ({utxos?.length ?? "–"})
          </button>
          <button
            onClick={handleCommit}
            disabled={!can("commit")}
            className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium hover:bg-emerald-700 disabled:opacity-30"
          >
            Commit{selectedUtxos.size > 0 ? ` (${selectedUtxos.size})` : ""}
          </button>
          <button
            onClick={handleClose}
            disabled={!can("close")}
            className="rounded bg-amber-600 px-3 py-1.5 text-sm font-medium hover:bg-amber-700 disabled:opacity-30"
          >
            Close
          </button>
          <button
            onClick={handleFanout}
            disabled={!can("fanout")}
            className="rounded bg-purple-600 px-3 py-1.5 text-sm font-medium hover:bg-purple-700 disabled:opacity-30"
          >
            Fanout
          </button>
          <button
            onClick={handleAbort}
            disabled={!can("abort")}
            className="rounded bg-gray-600 px-3 py-1.5 text-sm font-medium hover:bg-gray-700 disabled:opacity-30"
          >
            Abort
          </button>
        </div>
      )}

      {/* UTxO Selector */}
      {head && parsedUtxos.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-400">
              Wallet UTxOs ({parsedUtxos.length})
            </h3>
            <button
              onClick={toggleAllUtxos}
              className="text-xs text-indigo-400 hover:text-indigo-300"
            >
              {selectedUtxos.size === parsedUtxos.length
                ? "Deselect all"
                : "Select all"}
            </button>
          </div>
          <div className="max-h-60 overflow-y-auto rounded border border-gray-800 bg-gray-950 p-2 text-xs">
            {parsedUtxos.map((parsed, i) => (
              <label
                key={i}
                className={`flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 hover:bg-gray-800 ${
                  selectedUtxos.has(i) ? "bg-gray-800/50" : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedUtxos.has(i)}
                  onChange={() => toggleUtxo(i)}
                  className="mt-0.5 accent-indigo-500"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-gray-400">
                      {parsed.txHash.slice(0, 8)}...
                      {parsed.txHash.slice(-8)}#{parsed.index}
                    </span>
                    <span className="font-medium text-emerald-400">
                      {formatAda(parsed.lovelace)} ADA
                    </span>
                  </div>
                  {parsed.assets.length > 0 && (
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {parsed.assets.map((asset, j) => (
                        <span
                          key={j}
                          className="inline-block rounded bg-indigo-900/40 px-1.5 py-0.5 text-indigo-300"
                          title={`${asset.policyId}.${asset.assetName}`}
                        >
                          {asset.assetName || asset.policyId.slice(0, 8)}
                          {asset.quantity > 1n
                            ? ` x${asset.quantity.toString()}`
                            : ""}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded border border-red-800 bg-red-900/30 px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Event Log */}
      {head && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-gray-400">Event Log</h3>
          <div className="max-h-60 overflow-y-auto rounded border border-gray-800 bg-gray-950 p-3 font-mono text-xs">
            {logs.length === 0 ? (
              <span className="text-gray-600">No events yet.</span>
            ) : (
              logs.map((entry, i) => (
                <div key={i} className="py-0.5">
                  <span className="text-gray-600">
                    {new Date(entry.ts).toLocaleTimeString()}
                  </span>{" "}
                  <span className="text-indigo-400">{entry.tag}</span>
                  {entry.payload != null && (
                    <span className="text-gray-500">
                      {" "}
                      {JSON.stringify(entry.payload)}
                    </span>
                  )}
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </div>
      )}
    </section>
  );
}
