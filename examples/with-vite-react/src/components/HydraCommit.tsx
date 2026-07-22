import type { UTxO } from "@evolution-sdk/evolution";
import {
  Address,
  Assets,
  createClient,
  KeyHash,
  PolicyId,
  AssetName,
  Transaction,
  TransactionBody,
  TransactionHash,
} from "@evolution-sdk/evolution";
import { blake2b } from "@noble/hashes/blake2b";
import { makeTxBuilder } from "@evolution-sdk/evolution/sdk/builders/TransactionBuilder";
import { preprod as blockfrostPreprod } from "@evolution-sdk/evolution/sdk/provider/Blockfrost";
import { MaestroProvider } from "@evolution-sdk/evolution/sdk/provider/Maestro";
import { Head, Provider } from "@no-witness-labs/hydra-sdk";
import { Effect } from "effect";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type HeadStatus = Head.HeadStatus;

type DepositPhase =
  | "Submitted"
  | "Recorded"
  | "Activated"
  | "Finalized"
  | "Expired";

interface Props {
  walletApi: CardanoWalletApi;
}

interface LogEntry {
  ts: number;
  tag: string;
  payload?: unknown;
}

const RAW_HYDRA_URL = import.meta.env.VITE_HYDRA_NODE_URL as string | undefined;

/**
 * Resolve the configured hydra-node URL. A relative value (e.g. "/hydra") is
 * resolved against the current page origin — using wss:// on HTTPS pages and
 * ws:// on HTTP — so the app works behind any reverse proxy / tunnel without a
 * rebuild. Absolute ws(s):// URLs are used verbatim.
 */
function resolveNodeUrl(raw: string | undefined): string {
  if (!raw) return "";
  if (raw.startsWith("/")) {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${window.location.host}${raw}`;
  }
  return raw;
}

const HYDRA_URL = resolveNodeUrl(RAW_HYDRA_URL);

function wsToHttp(wsUrl: string): string {
  return wsUrl.replace(/^ws(s?):\/\//, "http$1://");
}

function formatAda(lovelace: bigint): string {
  return (Number(lovelace) / 1_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/** Compact, provider-agnostic summary of protocol parameters for the swap demo. */
function summarizeParams(
  p: unknown,
): ReadonlyArray<{ label: string; value: string }> {
  const r = (p ?? {}) as Record<string, unknown>;
  const show = (v: unknown): string =>
    v === undefined || v === null ? "-" : String(v);
  return [
    { label: "minFeeA (per byte)", value: show(r.minFeeA) },
    { label: "minFeeB (fixed)", value: show(r.minFeeB) },
    { label: "maxTxSize", value: show(r.maxTxSize) },
    {
      label: "coinsPerUtxoByte",
      value: show(r.coinsPerUtxoByte ?? r.coinsPerUtxoSize),
    },
  ];
}

const SWAP_PROVIDERS = [
  { id: "blockfrost", label: "Blockfrost", layer: "L1" },
  { id: "maestro", label: "Maestro", layer: "L1" },
  { id: "hydra", label: "Hydra", layer: "L2" },
] as const;
type SwapProviderId = (typeof SWAP_PROVIDERS)[number]["id"];

const { toHydraUtxoMap } = Provider;

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

  const built = await client.newTx().collectFrom({ inputs: selected }).build();

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

export default function HydraCommit({ walletApi }: Props) {
  const [url, setUrl] = useState(HYDRA_URL ?? "");
  const [head, setHead] = useState<Head.HydraHead | null>(null);
  const [hydraProvider, setHydraProvider] =
    useState<Provider.HydraProvider | null>(null);
  const [status, setStatus] = useState<HeadStatus>("Idle");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [utxos, setUtxos] = useState<ReadonlyArray<UTxO.UTxO> | null>(null);
  const [selectedUtxos, setSelectedUtxos] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [walletBalance, setWalletBalance] = useState<bigint | null>(null);

  // Provider-swap + recovery demo state
  const [reconnects, setReconnects] = useState(0);
  const greetingsSeen = useRef(0);
  const [swap, setSwap] = useState<{
    results: Partial<Record<SwapProviderId, unknown>>;
    busy?: SwapProviderId;
    error?: string;
  }>({ results: {} });
  const blockfrostProvider = useMemo(() => {
    const key = import.meta.env.VITE_BLOCKFROST_KEY_PREPROD as
      | string
      | undefined;
    return key ? blockfrostPreprod(key) : null;
  }, []);
  const maestroProvider = useMemo(() => {
    const key = import.meta.env.VITE_MAESTRO_KEY_PREPROD as string | undefined;
    // evolution-sdk's preprod() targets the dead preprod.api.maestro.org host;
    // construct against the working gomaestro endpoint instead.
    return key
      ? new MaestroProvider("https://preprod.gomaestro-api.org/v1", key)
      : null;
  }, []);

  // L2 state
  const [l2Utxos, setL2Utxos] = useState<ReadonlyArray<UTxO.UTxO>>([]);
  const [l2Balance, setL2Balance] = useState<bigint | null>(null);
  const [sendAddr, setSendAddr] = useState("");
  const [sendAda, setSendAda] = useState("");
  const [decommitAda, setDecommitAda] = useState("");
  const [recoverTxId, setRecoverTxId] = useState("");

  // Deposit lifecycle tracking. In v2 a commit is a deposit that lands on L1,
  // then is absorbed into the head asynchronously:
  //   Submitted → Recorded → Activated → Finalized (funds now in head)
  //                                    ↘ Expired    (funds stuck → recover)
  // Submitting the tx is only step 1 — the commit is not done until Finalized.
  const [deposits, setDeposits] = useState<
    Record<string, { phase: DepositPhase; deadline?: string }>
  >({});
  const [l2Refresh, setL2Refresh] = useState(0);
  const setDepositPhase = useCallback(
    (txId: string, phase: DepositPhase, deadline?: string) =>
      setDeposits((d) => ({
        ...d,
        [txId]: { phase, deadline: deadline ?? d[txId]?.deadline },
      })),
    [],
  );

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
    if (!hydraProvider) throw new Error("HydraProvider not initialized");

    const parsed = await hydraProvider.getSnapshotUtxos();
    setL2Utxos(parsed);
    const total = parsed.reduce(
      (sum, u) => sum + Assets.lovelaceOf(u.assets),
      0n,
    );
    setL2Balance(total);
    appendLog("FetchedL2UTxOs", {
      count: parsed.length,
      totalAda: formatAda(total),
    });
  }, [hydraProvider, appendLog]);

  // Auto-fetch L2 UTxOs when head becomes Open, when a deposit finalizes
  // (l2Refresh bump), or clear on other states.
  useEffect(() => {
    if (status === "Open" && hydraProvider) {
      fetchL2Utxos().catch(() => {});
    } else if (status !== "Open") {
      setL2Utxos([]);
      setL2Balance(null);
    }
  }, [status, hydraProvider, fetchL2Utxos, l2Refresh]);

  // -- Connect / Disconnect ---------------------------------------------------

  const handleConnect = useCallback(async () => {
    setError(null);
    try {
      const h = await Head.create({ url });
      const httpUrl = resolveHttpUrl(url);
      const provider = new Provider.HydraProvider({ head: h, httpUrl });

      headRef.current = h;
      greetingsSeen.current = 0;
      setReconnects(0);
      setHead(h);
      setHydraProvider(provider);
      setStatus(h.getState());
      appendLog("Connected", { url });

      h.subscribe((event) => {
        appendLog(event.tag, event.payload);
        setStatus(h.getState());

        // Track the deposit (incremental commit) lifecycle. Each event names
        // its deposit by tx id, so a commit can be followed to completion.
        const p = (event.payload ?? {}) as {
          pendingDeposit?: string;
          depositTxId?: string;
          deadline?: string;
        };
        switch (event.tag) {
          case "CommitRecorded":
            if (p.pendingDeposit)
              setDepositPhase(p.pendingDeposit, "Recorded", p.deadline);
            break;
          case "DepositActivated":
            if (p.depositTxId)
              setDepositPhase(p.depositTxId, "Activated", p.deadline);
            break;
          case "CommitFinalized":
            if (p.depositTxId) setDepositPhase(p.depositTxId, "Finalized");
            // Funds are now inside the head — refresh the L2 UTxO set.
            setL2Refresh((n) => n + 1);
            break;
          case "DepositExpired":
            if (p.depositTxId) {
              setDepositPhase(p.depositTxId, "Expired");
              // Pre-fill the recover input so the stuck funds are one click away.
              setRecoverTxId(p.depositTxId);
            }
            break;
        }
        // A repeat "Greetings" means the SDK transparently re-established the
        // WebSocket after a drop — i.e. recovery behavior.
        if (event.tag === "Greetings") {
          greetingsSeen.current += 1;
          if (greetingsSeen.current > 1) {
            setReconnects((n) => n + 1);
            appendLog("ConnectionRecovered", {
              reconnect: greetingsSeen.current - 1,
            });
          }
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [url, appendLog, setDepositPhase]);

  const handleDisconnect = useCallback(async () => {
    if (!headRef.current) return;
    await headRef.current.dispose();
    headRef.current = null;
    setHead(null);
    setHydraProvider(null);
    setStatus("Idle");
    setUtxos(null);
    setL2Utxos([]);
    setL2Balance(null);
    greetingsSeen.current = 0;
    setReconnects(0);
    setSwap({ results: {} });
    appendLog("Disconnected");
  }, [appendLog]);

  // -- Provider swap (same interface, L1 <-> L2) ------------------------------

  const runProviderQuery = useCallback(
    async (id: SwapProviderId) => {
      setSwap((s) => ({ ...s, busy: id, error: undefined }));
      try {
        const provider =
          id === "hydra"
            ? hydraProvider
            : id === "blockfrost"
              ? blockfrostProvider
              : maestroProvider;
        if (!provider) {
          throw new Error(
            id === "hydra"
              ? "Connect to a Hydra head first"
              : `${id} key not configured`,
          );
        }
        // Identical call against any backend — only the instance differs.
        const params = await provider.getProtocolParameters();
        setSwap((s) => ({
          ...s,
          results: { ...s.results, [id]: params },
          busy: undefined,
        }));
        appendLog(`Provider:${id}.getProtocolParameters`);
      } catch (err) {
        setSwap((s) => ({
          ...s,
          busy: undefined,
          error: `${id}: ${err instanceof Error ? err.message : String(err)}`,
        }));
      }
    },
    [hydraProvider, blockfrostProvider, maestroProvider, appendLog],
  );

  useEffect(
    () => () => {
      headRef.current?.dispose();
    },
    [],
  );

  // -- Fire-and-forget actions ------------------------------------------------

  const fireAction = useCallback((fn: () => Promise<void>) => {
    setError(null);
    setSubmitting(true);
    fn()
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setSubmitting(false));
  }, []);

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

  const handleSafeClose = useCallback(
    () => fireAction(() => head!.safeClose()),
    [head, fireAction],
  );

  const handleContest = useCallback(
    () =>
      fireAction(async () => {
        try {
          await head!.contest();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("CommandFailed")) {
            throw new Error(
              "Contest failed — no newer snapshot available to contest with. " +
                "Contest is only useful when the head was closed with an outdated snapshot.",
            );
          }
          throw err;
        }
      }),
    [head, fireAction],
  );

  const handleRecover = useCallback(
    (recoverTxId: string) =>
      fireAction(async () => {
        await head!.recover(recoverTxId);
        appendLog("RecoverSubmitted", { recoverTxId });
      }),
    [head, fireAction, appendLog],
  );

  // -- L2 Send ----------------------------------------------------------------

  const handleL2Send = useCallback(
    () =>
      fireAction(async () => {
        if (!hydraProvider) throw new Error("HydraProvider not initialized");
        const lovelace = BigInt(Math.round(parseFloat(sendAda) * 1_000_000));
        if (lovelace <= 0n) throw new Error("Amount must be > 0");

        // Resolve wallet address for change output
        const usedAddrs = await walletApi.getUsedAddresses();
        const unusedAddrs = await walletApi.getUnusedAddresses();
        const addrHex = usedAddrs[0] ?? unusedAddrs[0];
        if (!addrHex) throw new Error("Wallet returned no addresses");
        const changeAddress = Address.fromHex(addrHex);

        // L2 UTxOs already filtered by wallet address via fetchL2Utxos
        if (l2Utxos.length === 0) {
          throw new Error(
            `No L2 UTxOs found for ${Address.toBech32(changeAddress).slice(0, 20)}...`,
          );
        }

        // Extract payment key hash so the wallet knows it must sign
        const paymentCred = changeAddress.paymentCredential;
        if (paymentCred._tag !== "KeyHash") {
          throw new Error("Script addresses are not supported for L2 sends");
        }

        // Build unsigned tx (drainTo merges leftover into output instead of
        // requiring a separate change output — important on L2 where fees=0
        // and the user may be sending their full balance)
        const built = await makeTxBuilder({
          provider: hydraProvider,
          network: "Preprod",
        })
          .payToAddress({
            address: Address.fromBech32(sendAddr),
            assets: Assets.fromLovelace(lovelace),
          })
          .addSigner({ keyHash: paymentCred as KeyHash.KeyHash })
          .build({ changeAddress, availableUtxos: l2Utxos, drainTo: 0 });

        const unsignedTx = await built.toTransaction();
        const unsignedCbor = Transaction.toCBORHex(unsignedTx);

        // Sign with CIP-30 wallet (partialSign=true)
        const witnessHex = await walletApi.signTx(unsignedCbor, true);
        const signedCbor = Transaction.addVKeyWitnessesHex(
          unsignedCbor,
          witnessHex,
        );
        const signedTx = Transaction.fromCBORHex(signedCbor);

        // Submit to Hydra head via provider (NewTx over WebSocket)
        const txHash = await hydraProvider.submitTx(signedTx);

        appendLog("L2TxSubmitted", { txHash: TransactionHash.toHex(txHash) });
        setSendAddr("");
        setSendAda("");
      }),
    [
      hydraProvider,
      sendAddr,
      sendAda,
      walletApi,
      l2Utxos,
      fireAction,
      appendLog,
    ],
  );

  // -- L2 Decommit (withdraw from head to L1) ---------------------------------

  const handleDecommit = useCallback(
    () =>
      fireAction(async () => {
        if (!hydraProvider || !head) throw new Error("Not connected");
        const lovelace = BigInt(
          Math.round(parseFloat(decommitAda) * 1_000_000),
        );
        if (lovelace <= 0n) throw new Error("Amount must be > 0");

        const usedAddrs = await walletApi.getUsedAddresses();
        const unusedAddrs = await walletApi.getUnusedAddresses();
        const addrHex = usedAddrs[0] ?? unusedAddrs[0];
        if (!addrHex) throw new Error("Wallet returned no addresses");
        const changeAddress = Address.fromHex(addrHex);

        if (l2Utxos.length === 0) {
          throw new Error("No L2 UTxOs available for decommit");
        }

        const paymentCred = changeAddress.paymentCredential;
        if (paymentCred._tag !== "KeyHash") {
          throw new Error("Script addresses are not supported for decommit");
        }

        // Build decommit tx: spend L2 UTxOs, output to own L1 address
        const built = await makeTxBuilder({
          provider: hydraProvider,
          network: "Preprod",
        })
          .payToAddress({
            address: changeAddress,
            assets: Assets.fromLovelace(lovelace),
          })
          .addSigner({ keyHash: paymentCred as KeyHash.KeyHash })
          .build({ changeAddress, availableUtxos: l2Utxos, drainTo: 0 });

        const unsignedTx = await built.toTransaction();
        const unsignedCbor = Transaction.toCBORHex(unsignedTx);

        const witnessHex = await walletApi.signTx(unsignedCbor, true);
        const signedCbor = Transaction.addVKeyWitnessesHex(
          unsignedCbor,
          witnessHex,
        );
        const bodyBytes = TransactionBody.toCBORBytes(unsignedTx.body);
        const txId = TransactionHash.toHex(
          new TransactionHash.TransactionHash({
            hash: blake2b(bodyBytes, { dkLen: 32 }),
          }),
        );

        await head.decommit({
          type: "Tx ConwayEra",
          description: "Ledger Cddl Format",
          cborHex: signedCbor,
          txId,
        });

        appendLog("DecommitSubmitted", { txId });
        setDecommitAda("");

        // Refresh L2 UTxOs after decommit
        setTimeout(() => fetchL2Utxos().catch(() => {}), 3000);
      }),
    [
      hydraProvider,
      head,
      decommitAda,
      walletApi,
      l2Utxos,
      fireAction,
      appendLog,
      fetchL2Utxos,
    ],
  );

  // -- Fetch Wallet UTxOs -----------------------------------------------------

  const fetchUtxos = useCallback(async () => {
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
        const httpUrl = resolveHttpUrl(url);

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

        const draftTx = (await Effect.runPromise(
          Provider.postCommit(httpUrl, commitBody),
        )) as { cborHex: string; txId: string };
        appendLog("DraftTxReceived", { txId: draftTx.txId });

        let finalTxHex = draftTx.cborHex;
        if (hasWalletUtxos) {
          finalTxHex = await signDraftCommitTx(draftTx.cborHex, walletApi);
        }

        const submittedTxId = await walletApi.submitTx(finalTxHex);
        appendLog("TxSubmitted", { txId: submittedTxId });

        // The deposit is now on L1 but NOT yet in the head. Track it through
        // the async lifecycle (Recorded → Activated → Finalized) via the event
        // subscription; the "Deposit status" panel reflects real completion.
        setDepositPhase(submittedTxId, "Submitted");

        // Refresh wallet UTxOs (the selected inputs are now spent on L1).
        setTimeout(() => fetchUtxos().catch(() => {}), 3000);
      }),
    [
      url,
      utxos,
      selectedUtxos,
      walletApi,
      fireAction,
      appendLog,
      fetchUtxos,
      setDepositPhase,
    ],
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

  // The SDK guards commands internally and throws on invalid state transitions.
  // These checks are purely for UI button enable/disable.
  const canInit = !submitting && head && status === "Idle";
  const canCommit = !submitting && head && status === "Open";
  const canClose = !submitting && head && status === "Open";
  const canFanout = !submitting && head && status === "FanoutPossible";
  const canContest = !submitting && head && status === "Closed";
  const isOpen = status === "Open";
  const swapProviderReady = (id: SwapProviderId): boolean =>
    id === "hydra"
      ? !!hydraProvider
      : id === "blockfrost"
        ? !!blockfrostProvider
        : !!maestroProvider;

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
            {reconnects > 0 && (
              <span
                title="The SDK transparently re-established the WebSocket after a drop"
                className="rounded bg-emerald-900/60 px-2 py-0.5 text-xs font-medium text-emerald-300"
              >
                ↻ auto-recovered ×{reconnects}
              </span>
            )}
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
                L1:{" "}
                <span className="text-emerald-400 font-medium">
                  {formatAda(walletBalance)} ADA
                </span>
              </span>
            )}
            {l2Balance !== null && (
              <span>
                L2:{" "}
                <span className="text-cyan-400 font-medium">
                  {formatAda(l2Balance)} ADA
                </span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Provider swap (same evolution-sdk Provider interface, L1 <-> L2) */}
      {head && (
        <div className="space-y-3 rounded border border-indigo-900/40 bg-gray-950/50 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-indigo-300">
              Provider swap (same interface)
            </h3>
            <span className="text-xs text-gray-500">
              evolution-sdk <code className="text-gray-400">Provider</code>
            </span>
          </div>
          <p className="text-xs text-gray-500">
            The identical call{" "}
            <code className="text-gray-300">
              provider.getProtocolParameters()
            </code>{" "}
            runs against Blockfrost (L1), Maestro (L1), or the Hydra L2 provider
            — only the provider instance changes.
          </p>
          <div className="flex flex-wrap gap-2">
            {SWAP_PROVIDERS.map((p) => (
              <button
                key={p.id}
                onClick={() => runProviderQuery(p.id)}
                disabled={swap.busy === p.id || !swapProviderReady(p.id)}
                className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-40"
              >
                {swap.busy === p.id
                  ? "Querying…"
                  : `Query ${p.label} (${p.layer})`}
              </button>
            ))}
          </div>
          {swap.error && <p className="text-xs text-red-400">{swap.error}</p>}
          {Object.keys(swap.results).length > 0 && (
            <div className="grid grid-cols-3 gap-3 text-xs">
              {SWAP_PROVIDERS.map((p) => (
                <div
                  key={p.id}
                  className="rounded border border-gray-800 bg-gray-900 p-2"
                >
                  <div className="mb-1 font-medium text-gray-300">
                    {p.label} · {p.layer}
                  </div>
                  {swap.results[p.id] ? (
                    <table className="w-full">
                      <tbody>
                        {summarizeParams(swap.results[p.id]).map((row) => (
                          <tr key={row.label}>
                            <td className="pr-2 text-gray-500">{row.label}</td>
                            <td className="text-right font-mono text-gray-300">
                              {row.value}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <span className="text-gray-600">— not queried —</span>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-gray-600">
            Note L2 fees are 0 (Hydra) while L1 has real fees — same typed
            result, swapped backend.
          </p>
        </div>
      )}

      {/* Actions */}
      {head && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleInit}
            disabled={!canInit}
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
            disabled={!canCommit}
            className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium hover:bg-emerald-700 disabled:opacity-30"
          >
            Commit{selectedUtxos.size > 0 ? ` (${selectedUtxos.size})` : ""}
          </button>
          <button
            onClick={handleClose}
            disabled={!canClose}
            className="rounded bg-amber-600 px-3 py-1.5 text-sm font-medium hover:bg-amber-700 disabled:opacity-30"
          >
            Close
          </button>
          <button
            onClick={handleSafeClose}
            disabled={!canClose}
            className="rounded bg-amber-700 px-3 py-1.5 text-sm font-medium hover:bg-amber-800 disabled:opacity-30"
          >
            SafeClose
          </button>
          <button
            onClick={handleContest}
            disabled={!canContest}
            className="rounded bg-rose-600 px-3 py-1.5 text-sm font-medium hover:bg-rose-700 disabled:opacity-30"
          >
            Contest
          </button>
          <button
            onClick={handleFanout}
            disabled={!canFanout}
            className="rounded bg-purple-600 px-3 py-1.5 text-sm font-medium hover:bg-purple-700 disabled:opacity-30"
          >
            Fanout
          </button>
          {isOpen && (
            <button
              onClick={() =>
                fetchL2Utxos().catch((err) =>
                  setError(err instanceof Error ? err.message : String(err)),
                )
              }
              disabled={submitting}
              className="rounded bg-cyan-600 px-3 py-1.5 text-sm font-medium hover:bg-cyan-700 disabled:opacity-30"
            >
              Refresh L2 ({l2Utxos.length})
            </button>
          )}
        </div>
      )}

      {/* Deposit (incremental commit) status — a commit is not complete until
          Finalized; an Expired deposit can be recovered in one click. */}
      {Object.keys(deposits).length > 0 && (
        <div className="space-y-2 rounded border border-emerald-900/40 bg-gray-950/50 p-4">
          <h3 className="text-sm font-medium text-emerald-400">
            Deposit status
          </h3>
          <ul className="space-y-1.5 text-xs">
            {Object.entries(deposits)
              .reverse()
              .map(([txId, { phase }]) => {
                const color =
                  phase === "Finalized"
                    ? "bg-emerald-700"
                    : phase === "Expired"
                      ? "bg-rose-700"
                      : "bg-amber-700";
                return (
                  <li key={txId} className="flex items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 font-medium ${color}`}
                    >
                      {phase}
                    </span>
                    <code className="text-gray-400">
                      {txId.slice(0, 12)}…{txId.slice(-6)}
                    </code>
                    {phase === "Finalized" && (
                      <span className="text-emerald-500">in head ✓</span>
                    )}
                    {phase === "Expired" && (
                      <button
                        onClick={() => handleRecover(txId)}
                        disabled={submitting}
                        className="rounded bg-rose-600 px-2 py-0.5 font-medium hover:bg-rose-700 disabled:opacity-30"
                      >
                        Recover
                      </button>
                    )}
                    {phase !== "Finalized" && phase !== "Expired" && (
                      <span className="text-gray-500">
                        awaiting absorption…
                      </span>
                    )}
                  </li>
                );
              })}
          </ul>
        </div>
      )}

      {/* L2 Section */}
      {isOpen &&
        l2Utxos.length > 0 &&
        (() => {
          const l2Addresses = [
            ...new Set(l2Utxos.map((u) => Address.toBech32(u.address))),
          ];

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
                <div className="max-h-60 overflow-y-auto rounded border border-cyan-900/30 bg-gray-950 p-2 text-xs">
                  {l2Utxos.map((u, i) => {
                    const txHash = TransactionHash.toHex(u.transactionId);
                    const lovelace = Assets.lovelaceOf(u.assets);
                    const tokens = Assets.flatten(u.assets);
                    const addr = Address.toBech32(u.address);
                    return (
                      <div
                        key={i}
                        className="space-y-0.5 rounded px-2 py-1.5 hover:bg-gray-800"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-gray-400 break-all">
                            {txHash}#{Number(u.index)}
                          </span>
                          <span className="shrink-0 font-medium text-cyan-400">
                            {formatAda(lovelace)} ADA
                          </span>
                        </div>
                        <div className="font-mono text-gray-500 break-all">
                          {addr}
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
                    );
                  })}
                </div>
              </div>

              {/* L2 Send */}
              <div className="space-y-2">
                <span className="block text-xs text-gray-500">Send on L2</span>
                <input
                  type="text"
                  value={sendAddr}
                  onChange={(e) => setSendAddr(e.target.value)}
                  placeholder="Recipient address (addr_test1...)"
                  className="w-full rounded border border-cyan-900/40 bg-gray-950 px-3 py-1.5 text-sm focus:border-cyan-500 focus:outline-none"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={sendAda}
                    onChange={(e) => setSendAda(e.target.value)}
                    placeholder="Amount (ADA)"
                    className="flex-1 rounded border border-cyan-900/40 bg-gray-950 px-3 py-1.5 text-sm focus:border-cyan-500 focus:outline-none"
                  />
                  <button
                    onClick={handleL2Send}
                    disabled={submitting || !sendAddr || !sendAda}
                    className="rounded bg-cyan-600 px-4 py-1.5 text-sm font-medium hover:bg-cyan-700 disabled:opacity-30"
                  >
                    Send
                  </button>
                </div>
              </div>

              {/* L2 Decommit */}
              <div className="space-y-2">
                <span className="block text-xs text-gray-500">
                  Decommit (withdraw from L2 to L1)
                </span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={decommitAda}
                    onChange={(e) => setDecommitAda(e.target.value)}
                    placeholder="Amount (ADA)"
                    className="flex-1 rounded border border-amber-900/40 bg-gray-950 px-3 py-1.5 text-sm focus:border-amber-500 focus:outline-none"
                  />
                  <button
                    onClick={handleDecommit}
                    disabled={submitting || !decommitAda}
                    className="rounded bg-amber-600 px-4 py-1.5 text-sm font-medium hover:bg-amber-700 disabled:opacity-30"
                  >
                    Decommit
                  </button>
                </div>
              </div>

              {/* Recover failed deposit */}
              <div className="space-y-2">
                <span className="block text-xs text-gray-500">
                  Recover (reclaim a failed incremental commit deposit)
                </span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={recoverTxId}
                    onChange={(e) => setRecoverTxId(e.target.value)}
                    placeholder="Deposit tx ID"
                    className="flex-1 rounded border border-rose-900/40 bg-gray-950 px-3 py-1.5 text-sm font-mono focus:border-rose-500 focus:outline-none"
                  />
                  <button
                    onClick={() => {
                      handleRecover(recoverTxId);
                      setRecoverTxId("");
                    }}
                    disabled={submitting || !recoverTxId}
                    className="rounded bg-rose-600 px-4 py-1.5 text-sm font-medium hover:bg-rose-700 disabled:opacity-30"
                  >
                    Recover
                  </button>
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
