import type { InlineDatum, UTxO } from "@evolution-sdk/evolution";
import {
  Address,
  AssetName,
  Assets,
  createClient,
  Data,
  DatumHash,
  DatumOption,
  PolicyId,
  Script,
  Transaction,
  TransactionHash,
} from "@evolution-sdk/evolution";
import { Head } from "@no-witness-labs/hydra-sdk";
import { useCallback, useEffect, useRef, useState } from "react";

type HeadStatus = Head.HeadStatus;

interface Props {
  walletApi: CardanoWalletApi;
}

interface LogEntry {
  ts: number;
  tag: string;
  payload?: unknown;
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


/** Format lovelace as ADA with 6 decimal places. */
function formatAda(lovelace: bigint): string {
  const ada = Number(lovelace) / 1_000_000;
  return ada.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/** Build a Hydra-compatible UTxO map from evolution-sdk UTxOs. */
function buildHydraUtxoMap(
  selected: ReadonlyArray<UTxO.UTxO>,
): Record<string, Record<string, unknown>> {
  const utxoMap: Record<string, Record<string, unknown>> = {};
  for (const u of selected) {
    const txHash = TransactionHash.toHex(u.transactionId);
    const key = `${txHash}#${u.index}`;
    const bech32Addr = Address.toBech32(u.address);

    // Build value object
    const lovelace = Assets.lovelaceOf(u.assets);
    const value: Record<string, unknown> = { lovelace: Number(lovelace) };
    for (const [pid, name, qty] of Assets.flatten(u.assets)) {
      const pidHex = PolicyId.toHex(pid);
      const nameHex = AssetName.toHex(name);
      if (!value[pidHex]) value[pidHex] = {};
      (value[pidHex] as Record<string, number>)[nameHex] = Number(qty);
    }

    // Datum info
    let datumHash: string | null = null;
    let inlineDatumCbor: string | null = null;
    if (u.datumOption) {
      if (DatumOption.isDatumHash(u.datumOption)) {
        datumHash = DatumHash.toHex(u.datumOption);
      } else if (DatumOption.isInlineDatum(u.datumOption)) {
        inlineDatumCbor = Data.toCBORHex(
          (u.datumOption as InlineDatum.InlineDatum).data,
        );
      }
    }

    utxoMap[key] = {
      address: bech32Addr,
      datum: null,
      inlineDatum: null,
      inlineDatumRaw: inlineDatumCbor,
      inlineDatumhash: datumHash,
      referenceScript: u.scriptRef ? Script.toCBORHex(u.scriptRef) : null,
      value,
    };
  }
  return utxoMap;
}

/** Build a blueprint transaction CBOR hex using evolution-sdk's transaction builder. */
async function buildBlueprintTxCbor(
  selected: ReadonlyArray<UTxO.UTxO>,
  walletApi: CardanoWalletApi,
): Promise<string> {
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
    .collectFrom({ inputs: selected })
    .build();

  const tx = await built.toTransaction();
  return Transaction.toCBORHex(tx);
}

/**
 * Sign a draft commit transaction from hydra-node using the CIP-30 wallet.
 *
 * Uses byte-level witness merging (like CML): the wallet's vkey witnesses
 * are spliced directly into the raw transaction CBOR. Body, redeemers,
 * datums, scripts, and all other bytes are preserved verbatim.
 */
async function signDraftCommitTx(
  draftTxHex: string,
  walletApi: CardanoWalletApi,
): Promise<string> {
  const walletWitnessHex = await walletApi.signTx(draftTxHex, true);
  return Transaction.addVKeyWitnessesHex(draftTxHex, walletWitnessHex);
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
  const [logs, setLogs] = useState<Array<LogEntry>>([]);
  const [error, setError] = useState<string | null>(null);
  const [utxos, setUtxos] = useState<ReadonlyArray<UTxO.UTxO> | null>(null);
  const [selectedUtxos, setSelectedUtxos] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [contestationDeadline, setContestationDeadline] = useState<Date | null>(
    null,
  );
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

  const run = useCallback(async (label: string, fn: () => Promise<void>) => {
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
  }, []);

  const handleInit = useCallback(
    () => run("Initializing head on L1...", () => head!.init()),
    [head, run],
  );

  const handleCommit = useCallback(
    () =>
      run("Committing to head...", async () => {
        const walletUtxos = utxos ?? [];

        if (isMock(url)) {
          await head!.commit(walletUtxos);
          return;
        }

        const httpBase = wsToHttp(url);
        const commitUrl = import.meta.env.DEV
          ? "/hydra/commit"
          : `${httpBase}/commit`;

        // Build commit payload from selected UTxOs
        const selected = walletUtxos.filter((_, i) => selectedUtxos.has(i));
        const hasWalletUtxos = selected.length > 0;

        // Build blueprint commit request body
        let commitBody: unknown;
        if (hasWalletUtxos) {
          // Pick an unselected UTxO with >= 2 ADA as a fee UTxO (like the reference impl)
          const feeUtxo = walletUtxos.find(
            (u, i) =>
              !selectedUtxos.has(i) &&
              Assets.lovelaceOf(u.assets) >= 2_000_000n,
          );
          if (!feeUtxo) {
            throw new Error(
              "No unselected UTxO with >= 2 ADA available for fee coverage. " +
                "Please deselect one UTxO to use for fees.",
            );
          }

          const allUtxos = [...selected, feeUtxo];
          const feeHash = TransactionHash.toHex(feeUtxo.transactionId);
          appendLog("BuildingBlueprintTx", {
            commitUtxos: selected.length,
            feeUtxo: `${feeHash.slice(0, 8)}...#${feeUtxo.index}`,
          });

          const blueprintCbor = await buildBlueprintTxCbor(allUtxos, walletApi);
          const utxoMap = buildHydraUtxoMap(allUtxos);

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
        console.log(
          "[Commit] Full request body:",
          JSON.stringify(commitBody, null, 2),
        );

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
          // 2. Sign draft tx with wallet and assemble
          appendLog("RequestingWalletSignature");
          finalTxHex = await signDraftCommitTx(draftTx.cborHex, walletApi);
          appendLog("TxSigned");
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
    [head, url, utxos, selectedUtxos, walletApi, run, appendLog],
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
      const blockfrostKey = import.meta.env
        .VITE_BLOCKFROST_KEY_PREPROD as string;
      const client = createClient({
        network: "preprod",
        provider: {
          type: "blockfrost",
          baseUrl: "https://cardano-preprod.blockfrost.io/api/v0",
          projectId: blockfrostKey,
        },
        wallet: { type: "api" as const, api: walletApi as never },
      });
      const result = await client.getWalletUtxos();
      setUtxos(result);
      setSelectedUtxos(new Set());
      appendLog("FetchedUTxOs", { count: result.length });
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
      prev.size === utxos.length ? new Set() : new Set(utxos.map((_, i) => i)),
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
          {countdown &&
            (status === "Closed" || status === "FanoutPossible") && (
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
      {head && utxos && utxos.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-400">
              Wallet UTxOs ({utxos.length})
            </h3>
            <button
              onClick={toggleAllUtxos}
              className="text-xs text-indigo-400 hover:text-indigo-300"
            >
              {selectedUtxos.size === utxos.length
                ? "Deselect all"
                : "Select all"}
            </button>
          </div>
          <div className="max-h-60 overflow-y-auto rounded border border-gray-800 bg-gray-950 p-2 text-xs">
            {utxos.map((u, i) => {
              const txHash = TransactionHash.toHex(u.transactionId);
              const lovelace = Assets.lovelaceOf(u.assets);
              const tokens = Assets.flatten(u.assets);
              return (
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
                        {txHash.slice(0, 8)}...
                        {txHash.slice(-8)}#{Number(u.index)}
                      </span>
                      <span className="font-medium text-emerald-400">
                        {formatAda(lovelace)} ADA
                      </span>
                    </div>
                    {tokens.length > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {tokens.map(([pid, name, qty], j) => {
                          const pidHex = PolicyId.toHex(pid);
                          const nameHex = AssetName.toHex(name);
                          return (
                            <span
                              key={j}
                              className="inline-block rounded bg-indigo-900/40 px-1.5 py-0.5 text-indigo-300"
                              title={`${pidHex}.${nameHex}`}
                            >
                              {nameHex || pidHex.slice(0, 8)}
                              {qty > 1n ? ` x${qty.toString()}` : ""}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </label>
              );
            })}
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
