/**
 * Server-side Hydra head singleton.
 *
 * Manages a single head connection shared across API routes.
 * In production, you'd use a more robust connection management strategy.
 */
import {
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
// Singleton state
// ---------------------------------------------------------------------------

let head: Head.HydraHead | null = null;
let provider: Provider.HydraProvider | null = null;

export function getHead() {
  return head;
}

export function getProvider() {
  return provider;
}

export function isConnected() {
  return head !== null;
}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

export async function connect() {
  const wsUrl = process.env.HYDRA_WS_URL;
  const httpUrl = process.env.HYDRA_HTTP_URL;
  if (!wsUrl || !httpUrl) {
    throw new Error("HYDRA_WS_URL and HYDRA_HTTP_URL must be set");
  }

  if (head) {
    return { state: head.getState(), headId: head.headId };
  }

  head = await Head.create({ url: wsUrl });
  provider = new Provider.HydraProvider({ head, httpUrl });

  return { state: head.getState(), headId: head.headId };
}

export async function disconnect() {
  if (head) {
    await head.dispose();
    head = null;
    provider = null;
  }
}

// ---------------------------------------------------------------------------
// Head lifecycle
// ---------------------------------------------------------------------------

export async function init() {
  if (!head) throw new Error("Not connected");
  await head.init();
  return { state: head.getState() };
}

export async function close() {
  if (!head) throw new Error("Not connected");
  await head.close();
  return { state: head.getState() };
}

export async function fanout() {
  if (!head) throw new Error("Not connected");
  await head.fanout();
  return { state: head.getState() };
}

export async function abort() {
  if (!head) throw new Error("Not connected");
  await head.abort();
  return { state: head.getState() };
}

export function getState() {
  if (!head) return { state: "Disconnected" as const, headId: null };
  return { state: head.getState(), headId: head.headId };
}

// ---------------------------------------------------------------------------
// Wallet client (for server-side commit)
// ---------------------------------------------------------------------------

function makeWalletClient() {
  const mnemonic = process.env.SEED_PHRASE;
  const blockfrostKey = process.env.BLOCKFROST_KEY;
  if (!mnemonic || !blockfrostKey) {
    throw new Error("SEED_PHRASE and BLOCKFROST_KEY must be set");
  }
  return {
    client: createClient({
      network: "preprod",
      provider: {
        type: "blockfrost",
        baseUrl: "https://cardano-preprod.blockfrost.io/api/v0",
        projectId: blockfrostKey,
      },
      wallet: { type: "seed" as const, mnemonic },
    }),
    blockfrostKey,
  };
}

// ---------------------------------------------------------------------------
// Blueprint commit (server-side)
// ---------------------------------------------------------------------------

export async function blueprintCommit() {
  if (!head) throw new Error("Not connected");
  const httpUrl = process.env.HYDRA_HTTP_URL!;
  const { client, blockfrostKey } = makeWalletClient();

  // 1. Fetch wallet UTxOs
  const allUtxos = await client.getWalletUtxos();
  if (allUtxos.length < 2) {
    throw new Error("Need at least 2 UTxOs (one to commit, one for fees)");
  }

  // 2. Select UTxO to commit (first with >= 5 ADA)
  const selected = allUtxos.find(
    (u) => Assets.lovelaceOf(u.assets) >= 5_000_000n,
  );
  if (!selected) throw new Error("No UTxO with >= 5 ADA to commit");

  const selectedRef = `${TransactionHash.toHex(selected.transactionId)}#${selected.index}`;

  // 3. Find fee UTxO
  const feeUtxo = allUtxos.find(
    (u) =>
      `${TransactionHash.toHex(u.transactionId)}#${u.index}` !== selectedRef &&
      Assets.lovelaceOf(u.assets) >= 2_000_000n,
  );
  if (!feeUtxo) throw new Error("No UTxO with >= 2 ADA for fees");

  const commitUtxos = [selected, feeUtxo];

  // 4. Build blueprint
  const built = await client
    .newTx()
    .collectFrom({ inputs: commitUtxos })
    .build();
  const tx = await built.toTransaction();
  const blueprintCbor = Transaction.toCBORHex(tx);

  // 5. POST /commit
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

  // 6. Sign
  const witnessSet = await client.signTx(draftTx.cborHex, {
    utxos: commitUtxos,
  });
  const witnessHex = TransactionWitnessSet.toCBORHex(witnessSet);
  const signedCbor = Transaction.addVKeyWitnessesHex(
    draftTx.cborHex,
    witnessHex,
  );

  // 7. Submit to L1
  const res = await fetch(
    "https://cardano-preprod.blockfrost.io/api/v0/tx/submit",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/cbor",
        project_id: blockfrostKey,
      },
      body: Buffer.from(signedCbor, "hex"),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Blockfrost submit failed (${res.status}): ${text}`);
  }
  const txHash = await res.json();

  return {
    txHash: String(txHash),
    committed: Assets.lovelaceOf(selected.assets).toString(),
  };
}

// ---------------------------------------------------------------------------
// L2 UTxOs
// ---------------------------------------------------------------------------

export async function getSnapshotUtxos() {
  if (!provider) throw new Error("Not connected");
  const utxos = await provider.getSnapshotUtxos();
  return utxos.map((u) => ({
    txHash: TransactionHash.toHex(u.transactionId),
    index: Number(u.index),
    lovelace: Assets.lovelaceOf(u.assets).toString(),
    address: u.address,
  }));
}
