import type { UTxO } from "@evolution-sdk/evolution";
import {
  Address,
  Assets,
  createClient,
  PolicyId,
  AssetName,
  Transaction,
  TransactionHash,
} from "@evolution-sdk/evolution";
import { Head, Provider } from "@no-witness-labs/hydra-sdk";
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

function wsToHttp(wsUrl: string): string {
  return wsUrl.replace(/^ws(s?):\/\//, "http$1://");
}

function formatAda(lovelace: bigint): string {
  return (Number(lovelace) / 1_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

const { toHydraUtxoMap, fromHydraUtxoMap } = Provider;

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

async function signDraftCommitTx(
  draftTxHex: string,
  walletApi: CardanoWalletApi,
): Promise<string> {
  const walletWitnessHex = await walletApi.signTx(draftTxHex, true);
  return Transaction.addVKeyWitnessesHex(draftTxHex, walletWitnessHex);
}

/** Resolve the HTTP base URL, using the vite proxy in dev mode. */
function resolveHttpUrl(wsUrl: string): string {
  return import.meta.env.DEV ? "/hydra" : wsToHttp(wsUrl);
}

const ALLOWED: Record<string, ReadonlySet<HeadStatus>> = {
  init: new Set(["Idle"]),
  commit: new Set(["Initializing"]),
  close: new Set(["Open"]),
  fanout: new Set(["FanoutPossible"]),
  abort: new Set(["Idle", "Initializing"]),
};

export default function HydraCommit({ walletApi }: Props) {
  const [url, setUrl] = useState(HYDRA_URL ?? "");
  const [head, setHead] = useState<Head.HydraHead | null>(null);
  const [status, setStatus] = useState<HeadStatus>("Idle");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [utxos, setUtxos] = useState<ReadonlyArray<UTxO.UTxO> | null>(null);
  const [selectedUtxos, setSelectedUtxos] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [walletBalance, setWalletBalance] = useState<bigint | null>(null);

  // L2 state
  const [l2Utxos, setL2Utxos] = useState<ReadonlyArray<UTxO.UTxO>>([]);
  const [l2Balance, setL2Balance] = useState<bigint | null>(null);

  const headRef = useRef<Head.HydraHead | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll event log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const appendLog = useCallback((tag: string, payload?: unknown) => {
    setLogs((prev) => [...prev, { ts: Date.now(), tag, payload }]);
  }, []);

  // Poll status every 500ms as backup to subscription
  useEffect(() => {
    if (!head) return;
    const id = setInterval(() => setStatus(head.getState()), 500);
    return () => clearInterval(id);
  }, [head]);

  // -- Fetch L2 UTxOs ---------------------------------------------------------

  const fetchL2Utxos = useCallback(async () => {
    const httpUrl = resolveHttpUrl(url);
    const res = await fetch(`${httpUrl}/snapshot/utxo`);
    if (!res.ok) {
      throw new Error(`GET /snapshot/utxo failed (${res.status})`);
    }
    const utxoMap = await res.json();
    const parsed = fromHydraUtxoMap(utxoMap);
    setL2Utxos(parsed);
    const total = parsed.reduce(
      (sum, u) => sum + Assets.lovelaceOf(u.assets),
      0n,
    );
    setL2Balance(total);
    appendLog("FetchedL2UTxOs", { count: parsed.length, totalAda: formatAda(total) });
  }, [url, appendLog]);

  // Auto-fetch L2 UTxOs when head becomes Open
  useEffect(() => {
    if (status === "Open") {
      fetchL2Utxos().catch(() => {});
    } else {
      setL2Utxos([]);
      setL2Balance(null);
    }
  }, [status, fetchL2Utxos]);

  // -- Connect / Disconnect ---------------------------------------------------

  const handleConnect = useCallback(async () => {
    setError(null);
    try {
      const h = await Head.create({ url });
      headRef.current = h;
      setHead(h);
      setStatus(h.getState());
      appendLog("Connected", { url });

      h.subscribe((event) => {
        appendLog(event.tag, event.payload);
        setStatus(h.getState());

        // Auto-refresh L2 UTxOs on snapshot events
        if (
          event.tag === "SnapshotConfirmed" ||
          event.tag === "TxValid" ||
          event.tag === "HeadIsOpen"
        ) {
          fetchL2Utxos().catch(() => {});
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [url, appendLog, fetchL2Utxos]);

  const handleDisconnect = useCallback(async () => {
    if (!headRef.current) return;
    await headRef.current.dispose();
    headRef.current = null;
    setHead(null);
    setStatus("Idle");
    setUtxos(null);
    setL2Utxos([]);
    setL2Balance(null);
    appendLog("Disconnected");
  }, [appendLog]);

  useEffect(() => () => {
    headRef.current?.dispose();
  }, []);

  // -- Fire-and-forget actions ------------------------------------------------

  const fireAction = useCallback(
    (fn: () => Promise<void>) => {
      setError(null);
      setSubmitting(true);
      fn()
        .catch((err) => {
          setError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => setSubmitting(false));
    },
    [],
  );

  const handleInit = useCallback(
    () => fireAction(() => head!.init()),
    [head, fireAction],
  );

  const handleClose = useCallback(
    () => fireAction(() => head!.close()),
    [head, fireAction],
  );

  const handleFanout = useCallback(
    () => fireAction(() => head!.fanout()),
    [head, fireAction],
  );

  const handleAbort = useCallback(
    () => fireAction(() => head!.abort()),
    [head, fireAction],
  );

  // -- Fetch Wallet UTxOs -----------------------------------------------------

  const fetchUtxos = useCallback(async () => {
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
    const totalLovelace = result.reduce(
      (sum, u) => sum + Assets.lovelaceOf(u.assets),
      0n,
    );
    setWalletBalance(totalLovelace);
    appendLog("FetchedUTxOs", { count: result.length });
  }, [walletApi, appendLog]);

  const handleFetchUtxos = useCallback(async () => {
    setError(null);
    try {
      await fetchUtxos();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [fetchUtxos]);

  // -- Commit -----------------------------------------------------------------

  const handleCommit = useCallback(
    () =>
      fireAction(async () => {
        const walletUtxos = utxos ?? [];
        const httpBase = wsToHttp(url);
        const commitUrl = import.meta.env.DEV
          ? "/hydra/commit"
          : `${httpBase}/commit`;

        const selected = walletUtxos.filter((_, i) => selectedUtxos.has(i));
        const hasWalletUtxos = selected.length > 0;

        let commitBody: unknown;
        if (hasWalletUtxos) {
          const feeUtxo = walletUtxos.find(
            (u, i) =>
              !selectedUtxos.has(i) &&
              Assets.lovelaceOf(u.assets) >= 2_000_000n,
          );
          if (!feeUtxo) {
            throw new Error(
              "No unselected UTxO with >= 2 ADA available for fee coverage.",
            );
          }

          const allUtxos = [...selected, feeUtxo];
          const blueprintCbor = await buildBlueprintTxCbor(allUtxos, walletApi);
          const utxoMap = toHydraUtxoMap(allUtxos);

          commitBody = {
            blueprintTx: {
              type: "Tx ConwayEra",
              description: "Ledger Cddl Format",
              cborHex: blueprintCbor,
            },
            utxo: utxoMap,
          };
        } else {
          commitBody = {};
        }

        const res = await fetch(commitUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(commitBody),
        });

        if (!res.ok) {
          throw new Error(
            `POST /commit failed (${res.status}): ${await res.text()}`,
          );
        }

        const draftTx = (await res.json()) as { cborHex: string; txId: string };
        appendLog("DraftTxReceived", { txId: draftTx.txId });

        let finalTxHex = draftTx.cborHex;
        if (hasWalletUtxos) {
          finalTxHex = await signDraftCommitTx(draftTx.cborHex, walletApi);
        }

        const submittedTxId = await walletApi.submitTx(finalTxHex);
        appendLog("TxSubmitted", { txId: submittedTxId });

        // Refresh UTxOs after commit (Blockfrost may lag a few seconds)
        setTimeout(() => fetchUtxos().catch(() => {}), 3000);
      }),
    [url, utxos, selectedUtxos, walletApi, fireAction, appendLog, fetchUtxos],
  );

  // -- UTxO selection ---------------------------------------------------------

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

  const can = (action: string) => !submitting && head && ALLOWED[action]?.has(status);
  const isOpen = status === "Open";

  return (
    <section className="space-y-4 rounded-lg border border-gray-800 bg-gray-900 p-5">
      <h2 className="text-lg font-medium">Hydra Head</h2>

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
              placeholder="ws://localhost:4001"
              className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </label>
          <button
            onClick={handleConnect}
            disabled={!url}
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

      {/* Status */}
      {head && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">State:</span>
          <span className="rounded bg-gray-800 px-2 py-0.5 text-sm font-mono font-medium">
            {status}
          </span>
          {submitting && (
            <span className="text-sm text-yellow-300">Submitting...</span>
          )}
          <div className="ml-auto flex items-center gap-4 text-sm text-gray-400">
            {walletBalance !== null && (
              <span>
                L1: <span className="text-emerald-400 font-medium">{formatAda(walletBalance)} ADA</span>
              </span>
            )}
            {l2Balance !== null && (
              <span>
                L2: <span className="text-cyan-400 font-medium">{formatAda(l2Balance)} ADA</span>
              </span>
            )}
          </div>
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
            disabled={submitting}
            className="rounded bg-teal-600 px-3 py-1.5 text-sm font-medium hover:bg-teal-700 disabled:opacity-30"
          >
            Fetch UTxOs ({utxos?.length ?? "-"})
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
          {isOpen && (
            <button
              onClick={() => fetchL2Utxos().catch((err) => setError(err instanceof Error ? err.message : String(err)))}
              disabled={submitting}
              className="rounded bg-cyan-600 px-3 py-1.5 text-sm font-medium hover:bg-cyan-700 disabled:opacity-30"
            >
              Refresh L2 ({l2Utxos.length})
            </button>
          )}
        </div>
      )}

      {/* L2 Section */}
      {isOpen && l2Utxos.length > 0 && (() => {
        const l2Addresses = [...new Set(l2Utxos.map((u) => Address.toBech32(u.address)))];

        return (
          <div className="space-y-3 rounded border border-cyan-900/40 bg-gray-950/50 p-4">
            <h3 className="text-sm font-medium text-cyan-400">L2 Head</h3>

            {/* L2 Addresses */}
            <div>
              <span className="text-xs text-gray-500">
                {l2Addresses.length === 1 ? "Address" : "Addresses"}
              </span>
              {l2Addresses.map((addr) => (
                <p
                  key={addr}
                  className="mt-0.5 break-all font-mono text-xs text-gray-300"
                >
                  {addr}
                </p>
              ))}
            </div>

            {/* L2 UTxOs */}
            <div>
              <span className="mb-1 block text-xs text-gray-500">
                UTxOs ({l2Utxos.length})
              </span>
              <div className="max-h-40 overflow-y-auto rounded border border-cyan-900/30 bg-gray-950 p-2 text-xs">
                {l2Utxos.map((u, i) => {
                  const txHash = TransactionHash.toHex(u.transactionId);
                  const lovelace = Assets.lovelaceOf(u.assets);
                  const tokens = Assets.flatten(u.assets);
                  return (
                    <div
                      key={i}
                      className="flex items-start gap-2 rounded px-2 py-1 hover:bg-gray-800"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-gray-400">
                            {txHash.slice(0, 8)}...
                            {txHash.slice(-8)}#{Number(u.index)}
                          </span>
                          <span className="font-medium text-cyan-400">
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
                                  className="inline-block rounded bg-cyan-900/40 px-1.5 py-0.5 text-cyan-300"
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
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Wallet UTxO Selector */}
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
