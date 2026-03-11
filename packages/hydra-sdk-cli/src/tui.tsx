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
import { Box, render, Text, useApp, useInput } from "ink";
import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EventEntry {
  time: string;
  tag: string;
}

type ViewMode = "dashboard" | "l1-utxos" | "l2-utxos" | "commit-select";

export interface TuiConfig {
  url: string;
  mnemonic?: string;
  blockfrostKey?: string;
}

interface UtxoEntry {
  ref: string;
  lovelace: bigint;
  assets: string;
  raw: UTxO.UTxO;
}

const MAX_EVENTS = 15;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const timestamp = (): string => {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
};

const formatAda = (lovelace: bigint): string =>
  `${(Number(lovelace) / 1_000_000).toFixed(6)} ADA`;

const formatUtxoEntry = (u: UTxO.UTxO): UtxoEntry => {
  const ref = `${TransactionHash.toHex(u.transactionId)}#${u.index}`;
  const lovelace = Assets.lovelaceOf(u.assets);
  const tokens = Assets.flatten(u.assets)
    .filter(([, name]) => AssetName.toHex(name) !== "")
    .map(
      ([pid, name, qty]) =>
        `${PolicyId.toHex(pid).slice(0, 8)}..${AssetName.toHex(name)}: ${qty}`,
    )
    .join(", ");
  return { ref, lovelace, assets: tokens, raw: u };
};

const wsToHttp = (wsUrl: string): string =>
  wsUrl.replace(/^ws(s?):\/\//, "http$1://");

const validCommands: Record<Head.HeadStatus, Array<Head.ClientInputTag>> = {
  Idle: ["Init"],
  Initializing: ["Commit", "Abort"],
  Open: ["Close", "SafeClose", "Decommit"],
  Closed: ["Contest", "Fanout"],
  FanoutPossible: ["Fanout"],
  Final: [],
  Aborted: [],
};

const keyMap: Record<string, Head.ClientInputTag> = {
  i: "Init",
  x: "Close",
  s: "SafeClose",
  f: "Fanout",
  a: "Abort",
  t: "Contest",
};

const stateColor = (state: Head.HeadStatus): string => {
  switch (state) {
    case "Idle": return "gray";
    case "Initializing": return "yellow";
    case "Open": return "green";
    case "Closed": return "red";
    case "FanoutPossible": return "cyan";
    case "Final": return "blue";
    case "Aborted": return "magenta";
  }
};

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

const Header = () => (
  <Box borderStyle="single" borderColor="cyan" paddingX={1}>
    <Text bold color="cyan">Hydra Head TUI</Text>
  </Box>
);

const StatusBar = ({ headId, state }: { state: Head.HeadStatus; headId: string }) => (
  <Box borderStyle="single" paddingX={1} flexDirection="row" gap={2}>
    <Box>
      <Text bold>Status: </Text>
      <Text color={stateColor(state)} bold>{state}</Text>
    </Box>
    <Box>
      <Text bold>Head ID: </Text>
      <Text>{headId}</Text>
    </Box>
  </Box>
);

const EventLog = ({ events }: { events: Array<EventEntry> }) => (
  <Box borderStyle="single" flexDirection="column" paddingX={1} height={10}>
    <Text bold underline>Event Log</Text>
    {events.length === 0 ? (
      <Text dimColor>  Waiting for events...</Text>
    ) : (
      events.map((e, i) => (
        <Text key={i}>
          <Text dimColor>{e.time}</Text>
          <Text> </Text>
          <Text>{e.tag}</Text>
        </Text>
      ))
    )}
  </Box>
);

const CommandHelp = ({ hasWallet, state }: { state: Head.HeadStatus; hasWallet: boolean }) => {
  const available = validCommands[state];

  const commandKeys: Array<{ key: string; label: string; command: Head.ClientInputTag }> = [
    { key: "i", label: "init", command: "Init" },
    { key: "c", label: "commit", command: "Commit" },
    { key: "x", label: "close", command: "Close" },
    { key: "s", label: "safeClose", command: "SafeClose" },
    { key: "f", label: "fanout", command: "Fanout" },
    { key: "a", label: "abort", command: "Abort" },
    { key: "t", label: "contest", command: "Contest" },
  ];

  return (
    <Box borderStyle="single" paddingX={1} flexDirection="column">
      <Text bold underline>Commands</Text>
      <Box flexDirection="row" gap={1} flexWrap="wrap">
        {commandKeys.map(({ command, key, label }) => {
          const enabled = available.includes(command);
          return (
            <Box key={key}>
              <Text dimColor={!enabled} color={enabled ? "white" : undefined}>
                [{key}]{label}
              </Text>
            </Box>
          );
        })}
        <Text dimColor={!hasWallet} color={hasWallet ? "white" : undefined}>[1]l1-utxo</Text>
        <Text color="white">[2]l2-utxo</Text>
        <Text color="red">[q]uit</Text>
      </Box>
    </Box>
  );
};

const Feedback = ({ message }: { message: string }) => (
  <Box paddingX={1}>
    <Text dimColor>&gt; {message}</Text>
  </Box>
);

// ---------------------------------------------------------------------------
// UTxO List View
// ---------------------------------------------------------------------------

const UtxoListView = ({ error, loading, title, utxos }: {
  title: string;
  utxos: Array<UtxoEntry>;
  loading: boolean;
  error: string | null;
}) => (
  <Box borderStyle="single" flexDirection="column" paddingX={1}>
    <Text bold underline>{title}</Text>
    {loading ? (
      <Text dimColor>  Loading...</Text>
    ) : error ? (
      <Text color="red">  {error}</Text>
    ) : utxos.length === 0 ? (
      <Text dimColor>  No UTxOs found</Text>
    ) : (
      utxos.map((u) => (
        <Text key={u.ref}>
          <Text dimColor>{u.ref.slice(0, 16)}...#{u.ref.split("#")[1]}</Text>
          <Text> </Text>
          <Text color="green">{formatAda(u.lovelace)}</Text>
          {u.assets ? <Text dimColor> + {u.assets}</Text> : null}
        </Text>
      ))
    )}
    <Box marginTop={1}>
      <Text dimColor>Press ESC to go back</Text>
    </Box>
  </Box>
);

// ---------------------------------------------------------------------------
// Commit Selection View
// ---------------------------------------------------------------------------

const CommitSelectView = ({ cursor, error, loading, selected, utxos }: {
  utxos: Array<UtxoEntry>;
  selected: Set<number>;
  cursor: number;
  loading: boolean;
  error: string | null;
}) => (
  <Box borderStyle="single" flexDirection="column" paddingX={1}>
    <Text bold underline>Select UTxOs to Commit</Text>
    {loading ? (
      <Text dimColor>  Loading wallet UTxOs...</Text>
    ) : error ? (
      <Text color="red">  {error}</Text>
    ) : utxos.length === 0 ? (
      <Text dimColor>  No UTxOs found</Text>
    ) : (
      utxos.map((u, i) => {
        const isSelected = selected.has(i);
        const isCursor = i === cursor;
        return (
          <Text key={u.ref}>
            <Text color={isCursor ? "cyan" : undefined}>
              {isCursor ? ">" : " "} [{isSelected ? "x" : " "}] </Text>
            <Text dimColor>{u.ref.slice(0, 16)}...#{u.ref.split("#")[1]}</Text>
            <Text> </Text>
            <Text color="green">{formatAda(u.lovelace)}</Text>
            {u.assets ? <Text dimColor> + {u.assets}</Text> : null}
          </Text>
        );
      })
    )}
    <Box marginTop={1} flexDirection="row" gap={2}>
      <Text dimColor>↑↓ navigate</Text>
      <Text dimColor>SPACE toggle</Text>
      <Text dimColor>ENTER commit{selected.size > 0 ? ` (${selected.size})` : ""}</Text>
      <Text dimColor>ESC back</Text>
    </Box>
  </Box>
);

// ---------------------------------------------------------------------------
// L2 UTxO Types
// ---------------------------------------------------------------------------

interface L2UtxoEntry {
  ref: string;
  lovelace: bigint;
}

const L2UtxoListView = ({ error, loading, utxos }: {
  utxos: Array<L2UtxoEntry>;
  loading: boolean;
  error: string | null;
}) => (
  <Box borderStyle="single" flexDirection="column" paddingX={1}>
    <Text bold underline>L2 UTxOs (Head Snapshot)</Text>
    {loading ? (
      <Text dimColor>  Loading...</Text>
    ) : error ? (
      <Text color="red">  {error}</Text>
    ) : utxos.length === 0 ? (
      <Text dimColor>  No L2 UTxOs found</Text>
    ) : (
      utxos.map((u) => (
        <Text key={u.ref}>
          <Text dimColor>{u.ref.slice(0, 16)}...#{u.ref.split("#")[1]}</Text>
          <Text> </Text>
          <Text color="green">{formatAda(u.lovelace)}</Text>
        </Text>
      ))
    )}
    <Box marginTop={1}>
      <Text dimColor>Press ESC to go back</Text>
    </Box>
  </Box>
);

// ---------------------------------------------------------------------------
// App Root
// ---------------------------------------------------------------------------

const App = ({ config, head }: { head: Head.HydraHead; config: TuiConfig }) => {
  const { exit } = useApp();
  const hasWallet = Boolean(config.mnemonic && config.blockfrostKey);

  // Dashboard state
  const [state, setState] = useState<Head.HeadStatus>(head.getState());
  const [headId, setHeadId] = useState(head.headId ?? "none");
  const [events, setEvents] = useState<Array<EventEntry>>([]);
  const [feedback, setFeedback] = useState("Connected. Waiting for input...");
  const sendingRef = useRef(false);

  // View mode
  const [view, setView] = useState<ViewMode>("dashboard");

  // L1 UTxO state
  const [l1Utxos, setL1Utxos] = useState<Array<UtxoEntry>>([]);
  const [l1Loading, setL1Loading] = useState(false);
  const [l1Error, setL1Error] = useState<string | null>(null);

  // L2 UTxO state
  const [l2Utxos, setL2Utxos] = useState<Array<L2UtxoEntry>>([]);
  const [l2Loading, setL2Loading] = useState(false);
  const [l2Error, setL2Error] = useState<string | null>(null);

  // Commit selection state
  const [commitCursor, setCommitCursor] = useState(0);
  const [commitSelected, setCommitSelected] = useState<Set<number>>(new Set());

  // Event-driven state updates via subscribe()
  useEffect(() => {
    const unsub = head.subscribe((event) => {
      setState(head.getState());
      setHeadId(head.headId ?? "none");
      setEvents((prev) => {
        const next = [...prev, { time: timestamp(), tag: event.tag }];
        return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next;
      });
    });
    // Fallback polling to catch missed events (PubSub sliding may drop under load)
    const poll = setInterval(() => {
      setState(head.getState());
      setHeadId(head.headId ?? "none");
    }, 2000);
    return () => {
      unsub();
      clearInterval(poll);
    };
  }, [head]);

  // Fetch L1 UTxOs
  const fetchL1Utxos = useCallback(async () => {
    if (!config.mnemonic || !config.blockfrostKey) return;
    setL1Loading(true);
    setL1Error(null);
    try {
      const client = createClient({
        network: "preprod",
        provider: {
          type: "blockfrost",
          baseUrl: "https://cardano-preprod.blockfrost.io/api/v0",
          projectId: config.blockfrostKey,
        },
        wallet: { type: "seed" as const, mnemonic: config.mnemonic },
      });
      const utxos = await client.getWalletUtxos();
      setL1Utxos(utxos.map(formatUtxoEntry));
    } catch (e) {
      setL1Error(e instanceof Error ? e.message : String(e));
    } finally {
      setL1Loading(false);
    }
  }, [config.mnemonic, config.blockfrostKey]);

  // Fetch L2 UTxOs
  const fetchL2Utxos = useCallback(async () => {
    setL2Loading(true);
    setL2Error(null);
    try {
      const httpUrl = wsToHttp(config.url);
      const res = await fetch(`${httpUrl}/snapshot/utxo`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const utxoMap = await res.json() as Record<string, { value: { lovelace: number } }>;
      setL2Utxos(
        Object.entries(utxoMap).map(([ref, txOut]) => ({
          ref,
          lovelace: BigInt(txOut.value.lovelace),
        })),
      );
    } catch (e) {
      setL2Error(e instanceof Error ? e.message : String(e));
    } finally {
      setL2Loading(false);
    }
  }, [config.url]);

  // Commit selected UTxOs
  const commitSelected$ = useCallback(async () => {
    if (!config.mnemonic || !config.blockfrostKey) return;
    if (commitSelected.size === 0) {
      // Empty commit
      setView("dashboard");
      setFeedback("Sending empty Commit...");
      sendingRef.current = true;
      try {
        await head.commit({});
        setFeedback("Empty commit sent");
      } catch (e) {
        setFeedback(`Error: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        sendingRef.current = false;
      }
      return;
    }

    const selected = Array.from(commitSelected).map((i) => l1Utxos[i]!.raw);
    const selectedRefs = Array.from(commitSelected).map((i) => l1Utxos[i]!.ref);
    setView("dashboard");
    setFeedback(`Committing ${selected.length} UTxO(s)...`);
    sendingRef.current = true;

    try {
      const client = createClient({
        network: "preprod",
        provider: {
          type: "blockfrost",
          baseUrl: "https://cardano-preprod.blockfrost.io/api/v0",
          projectId: config.blockfrostKey,
        },
        wallet: { type: "seed" as const, mnemonic: config.mnemonic },
      });

      // Find fee UTxO (not selected, >= 2 ADA)
      const allWalletUtxos = await client.getWalletUtxos();
      const selectedRefSet = new Set(selectedRefs);
      const feeUtxo = allWalletUtxos.find(
        (u) =>
          !selectedRefSet.has(`${TransactionHash.toHex(u.transactionId)}#${u.index}`) &&
          Assets.lovelaceOf(u.assets) >= 2_000_000n,
      );
      if (!feeUtxo) {
        setFeedback("No unselected UTxO with >= 2 ADA for fee coverage.");
        return;
      }

      const allUtxos = [...selected, feeUtxo];

      // Build blueprint TX
      const built = await client.newTx().collectFrom({ inputs: allUtxos }).build();
      const tx = await built.toTransaction();
      const blueprintCbor = Transaction.toCBORHex(tx);

      // POST /commit
      const httpUrl = wsToHttp(config.url);
      const utxoMap = Provider.toHydraUtxoMap(allUtxos);
      const commitRes = await fetch(`${httpUrl}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blueprintTx: {
            type: "Tx ConwayEra",
            description: "Ledger Cddl Format",
            cborHex: blueprintCbor,
          },
          utxo: utxoMap,
        }),
      });
      if (!commitRes.ok) {
        const text = await commitRes.text();
        throw new Error(`POST /commit failed: ${commitRes.status} ${text}`);
      }
      const draftTx = await commitRes.json() as { cborHex: string };
      setFeedback("Draft TX received, signing...");

      // Sign
      const witnessSet = await client.signTx(draftTx.cborHex, { utxos: allUtxos });
      const witnessHex = TransactionWitnessSet.toCBORHex(witnessSet);
      const signedCborHex = Transaction.addVKeyWitnessesHex(draftTx.cborHex, witnessHex);

      // Submit to Blockfrost
      const submitRes = await fetch(
        "https://cardano-preprod.blockfrost.io/api/v0/tx/submit",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/cbor",
            project_id: config.blockfrostKey,
          },
          body: Buffer.from(signedCborHex, "hex"),
        },
      );
      if (!submitRes.ok) {
        const text = await submitRes.text();
        throw new Error(`Submit failed: ${submitRes.status} ${text}`);
      }
      const txHash = await submitRes.json() as string;
      setFeedback(`Committed! TX: ${txHash}`);
    } catch (e) {
      setFeedback(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      sendingRef.current = false;
    }
  }, [commitSelected, l1Utxos, head, config]);

  // Send lifecycle command (fire-and-forget via send(), state tracked by subscribe)
  // Only init() uses the full method to extract headId.
  const sendCommand = useCallback(
    async (command: Head.ClientInputTag) => {
      if (sendingRef.current) return;
      const available = validCommands[head.getState()];
      if (!available.includes(command)) {
        setFeedback(`Cannot ${command} in ${head.getState()} state`);
        return;
      }
      sendingRef.current = true;
      setFeedback(`Sending ${command}...`);
      try {
        if (command === "Init") {
          await head.init();
        } else {
          await head.send(command);
        }
        setFeedback(`${command} sent`);
      } catch (e) {
        setFeedback(`Error: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        sendingRef.current = false;
      }
    },
    [head],
  );

  useInput((input, key) => {
    // --- Commit select view ---
    if (view === "commit-select") {
      if (key.escape) {
        setView("dashboard");
        return;
      }
      if (key.upArrow) {
        setCommitCursor((c) => Math.max(0, c - 1));
        return;
      }
      if (key.downArrow) {
        setCommitCursor((c) => Math.min(l1Utxos.length - 1, c + 1));
        return;
      }
      if (input === " ") {
        setCommitSelected((prev) => {
          const next = new Set(prev);
          if (next.has(commitCursor)) next.delete(commitCursor);
          else next.add(commitCursor);
          return next;
        });
        return;
      }
      if (key.return) {
        void commitSelected$();
        return;
      }
      return;
    }

    // --- Sub-views (l1/l2 utxo list) ---
    if (view !== "dashboard") {
      if (key.escape) setView("dashboard");
      return;
    }

    // --- Dashboard ---
    if (input === "q") {
      exit();
      return;
    }
    if (input === "1" && hasWallet) {
      setView("l1-utxos");
      void fetchL1Utxos();
      return;
    }
    if (input === "2") {
      setView("l2-utxos");
      void fetchL2Utxos();
      return;
    }
    if (input === "c") {
      if (!validCommands[head.getState()].includes("Commit")) {
        setFeedback(`Cannot Commit in ${head.getState()} state`);
        return;
      }
      if (hasWallet) {
        setView("commit-select");
        setCommitCursor(0);
        setCommitSelected(new Set());
        void fetchL1Utxos();
      } else {
        void sendCommand("Commit");
      }
      return;
    }
    const command = keyMap[input];
    if (command) {
      void sendCommand(command);
    }
  });

  return (
    <Box flexDirection="column">
      <Header />
      <StatusBar state={state} headId={headId} />

      {view === "dashboard" && (
        <>
          <EventLog events={events} />
          <CommandHelp state={state} hasWallet={hasWallet} />
        </>
      )}

      {view === "l1-utxos" && (
        <UtxoListView title="L1 Wallet UTxOs" utxos={l1Utxos} loading={l1Loading} error={l1Error} />
      )}

      {view === "l2-utxos" && (
        <L2UtxoListView utxos={l2Utxos} loading={l2Loading} error={l2Error} />
      )}

      {view === "commit-select" && (
        <CommitSelectView
          utxos={l1Utxos}
          selected={commitSelected}
          cursor={commitCursor}
          loading={l1Loading}
          error={l1Error}
        />
      )}

      <Feedback message={feedback} />
    </Box>
  );
};

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export const runTui = async (config: TuiConfig): Promise<void> => {
  const head = await Head.create({ url: config.url });
  const { waitUntilExit } = render(<App head={head} config={config} />);
  await waitUntilExit();
  await head.dispose();
};
