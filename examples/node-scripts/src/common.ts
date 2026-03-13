import {
  Address,
  Assets,
  createClient,
  Transaction,
  TransactionHash,
  TransactionWitnessSet,
} from "@evolution-sdk/evolution";
import type { UTxO } from "@evolution-sdk/evolution";
import { Head, Provider } from "@no-witness-labs/hydra-sdk";
import { Effect } from "effect";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

export function env(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing env var: ${key}`);
  return val;
}

export const HYDRA_WS_URL = () => env("HYDRA_WS_URL");
export const HYDRA_HTTP_URL = () => env("HYDRA_HTTP_URL");
export const SEED_PHRASE = () => env("SEED_PHRASE");
export const BLOCKFROST_KEY = () => env("BLOCKFROST_KEY");

// ---------------------------------------------------------------------------
// Wallet client (evolution-sdk)
// ---------------------------------------------------------------------------

export function makeWalletClient(mnemonic: string, blockfrostKey: string) {
  return createClient({
    network: "preprod",
    provider: {
      type: "blockfrost",
      baseUrl: "https://cardano-preprod.blockfrost.io/api/v0",
      projectId: blockfrostKey,
    },
    wallet: { type: "seed" as const, mnemonic },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function formatAda(lovelace: bigint): string {
  return `${(Number(lovelace) / 1_000_000).toFixed(2)} ADA`;
}

export function wsToHttp(wsUrl: string): string {
  return wsUrl.replace(/^ws(s?):\/\//, "http$1://");
}

export function log(label: string, data?: unknown) {
  const ts = new Date().toISOString().slice(11, 23);
  const msg = data !== undefined ? `${label}: ${JSON.stringify(data)}` : label;
  console.log(`[${ts}] ${msg}`);
}

// ---------------------------------------------------------------------------
// Head lifecycle helpers
// ---------------------------------------------------------------------------

/** Connect to hydra-node and create HydraProvider. */
export async function connectHead(wsUrl: string, httpUrl: string) {
  log("Connecting", { wsUrl });
  const head = await Head.create({ url: wsUrl });
  const provider = new Provider.HydraProvider({ head, httpUrl });
  log("Connected", { state: head.getState() });
  return { head, provider };
}

/** Wait for a specific head state via event subscription. */
export function waitForState(
  head: Head.HydraHead,
  target: Head.HeadStatus,
  timeoutMs = 120_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (head.getState() === target) return resolve();

    const timer = setTimeout(() => {
      unsub();
      reject(new Error(`Timed out waiting for state: ${target}`));
    }, timeoutMs);

    const unsub = head.subscribe(() => {
      if (head.getState() === target) {
        clearTimeout(timer);
        unsub();
        resolve();
      }
    });
  });
}

/** Init the head and wait for Initializing state. */
export async function initHead(head: Head.HydraHead) {
  log("Init", "Sending Init command...");
  await head.init();
  log("Init", `State: ${head.getState()}`);
}

/** Blueprint commit: select UTxOs, build blueprint, post /commit, sign, submit to L1. */
export async function blueprintCommit(
  head: Head.HydraHead,
  httpUrl: string,
  mnemonic: string,
  blockfrostKey: string,
  utxoFilter?: (utxos: ReadonlyArray<UTxO.UTxO>) => UTxO.UTxO[],
) {
  const client = makeWalletClient(mnemonic, blockfrostKey);

  // 1. Fetch wallet UTxOs
  const allUtxos = await client.getWalletUtxos();
  log("Commit", `Found ${allUtxos.length} wallet UTxO(s)`);

  if (allUtxos.length < 2) {
    throw new Error(
      "Need at least 2 UTxOs: one to commit, one for fee coverage.",
    );
  }

  // 2. Select UTxOs to commit (default: first UTxO with >= 5 ADA)
  let selected: UTxO.UTxO[];
  if (utxoFilter) {
    selected = utxoFilter(allUtxos);
  } else {
    const candidate = allUtxos.find(
      (u) => Assets.lovelaceOf(u.assets) >= 5_000_000n,
    );
    if (!candidate) throw new Error("No UTxO with >= 5 ADA to commit");
    selected = [candidate];
  }

  const selectedRefs = new Set(
    selected.map(
      (u) => `${TransactionHash.toHex(u.transactionId)}#${u.index}`,
    ),
  );

  // 3. Find fee UTxO
  const feeUtxo = allUtxos.find(
    (u) =>
      !selectedRefs.has(
        `${TransactionHash.toHex(u.transactionId)}#${u.index}`,
      ) && Assets.lovelaceOf(u.assets) >= 2_000_000n,
  );
  if (!feeUtxo) {
    throw new Error("No unselected UTxO with >= 2 ADA for fee coverage.");
  }

  const commitUtxos = [...selected, feeUtxo];
  const totalCommit = selected.reduce(
    (sum, u) => sum + Assets.lovelaceOf(u.assets),
    0n,
  );
  log("Commit", `Committing ${formatAda(totalCommit)} in ${selected.length} UTxO(s)`);

  // 4. Build blueprint transaction
  const built = await client
    .newTx()
    .collectFrom({ inputs: commitUtxos })
    .build();
  const tx = await built.toTransaction();
  const blueprintCbor = Transaction.toCBORHex(tx);

  // 5. POST /commit to hydra-node
  const utxoMap = Provider.toHydraUtxoMap(commitUtxos);
  const draftTx = (await Effect.runPromise(
    Provider.postCommit(httpUrl, {
      blueprintTx: {
        type: "Tx ConwayEra",
        description: "Ledger Cddl Format",
        cborHex: blueprintCbor,
      },
      utxo: utxoMap,
    }),
  )) as { cborHex: string; txId: string };
  log("Commit", `Draft TX received: ${draftTx.txId}`);

  // 6. Sign draft TX
  const witnessSet = await client.signTx(draftTx.cborHex, {
    utxos: commitUtxos,
  });
  const witnessHex = TransactionWitnessSet.toCBORHex(witnessSet);
  const signedCborHex = Transaction.addVKeyWitnessesHex(
    draftTx.cborHex,
    witnessHex,
  );

  // 7. Submit to L1 via Blockfrost
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
    throw new Error(`Blockfrost submit failed (${res.status}): ${text}`);
  }
  const txHash = await res.json();
  log("Commit", `L1 TX submitted: ${txHash}`);

  // 8. Wait for head to open
  log("Commit", "Waiting for head to open...");
  await waitForState(head, "Open", 300_000);
  log("Commit", "Head is Open");
}

/** Close head, wait for FanoutPossible, then fanout. */
export async function closeAndFanout(head: Head.HydraHead) {
  log("Close", "Closing head...");
  await head.close();
  log("Close", `State: ${head.getState()}`);

  log("Fanout", "Waiting for FanoutPossible...");
  await waitForState(head, "FanoutPossible", 300_000);

  log("Fanout", "Running fanout...");
  await head.fanout();

  log("Fanout", "Waiting for Final...");
  await waitForState(head, "Final", 300_000);
  log("Fanout", "Head is Final — UTxOs are back on L1");
}

/** Full cleanup: close, fanout, dispose. */
export async function teardown(head: Head.HydraHead) {
  const state = head.getState();
  if (state === "Open") {
    await closeAndFanout(head);
  }
  await head.dispose();
  log("Done", "Head disposed");
}

/** Get wallet address from seed phrase. */
export async function getWalletAddress(mnemonic: string, blockfrostKey: string) {
  const client = makeWalletClient(mnemonic, blockfrostKey);
  return client.address();
}
