/**
 * Datum-based state machine update inside a Hydra Head.
 *
 * Full lifecycle: connect → init → commit → create UTxO with datum → update datum → close → fanout.
 *
 * Demonstrates a simple counter pattern: create a UTxO with inline datum (counter = 0),
 * then spend it and recreate with (counter = 1).
 *
 * Usage:
 *   cp .env.example .env   # fill in values
 *   pnpm state-update
 */
import {
  Address,
  Assets,
  Data,
  InlineDatum,
  KeyHash,
  Transaction,
  TransactionHash,
  TransactionWitnessSet,
} from "@evolution-sdk/evolution";
import type { UTxO } from "@evolution-sdk/evolution";
import { makeTxBuilder } from "@evolution-sdk/evolution/sdk/builders/TransactionBuilder";
import { Provider } from "@no-witness-labs/hydra-sdk";
import {
  blueprintCommit,
  connectHead,
  formatAda,
  getWalletAddress,
  initHead,
  log,
  makeWalletClient,
  teardown,
  BLOCKFROST_KEY,
  HYDRA_HTTP_URL,
  HYDRA_WS_URL,
  SEED_PHRASE,
} from "./common.js";

/** Create an inline datum option with a counter value (Plutus integer). */
function counterDatum(n: number): InlineDatum.InlineDatum {
  return new InlineDatum.InlineDatum({
    data: BigInt(n),
  });
}

/** Extract counter value from an InlineDatum. */
function readCounter(datum: InlineDatum.InlineDatum): bigint | undefined {
  if (Data.isInt(datum.data)) return datum.data;
  return undefined;
}

async function signAndSubmit(
  provider: Provider.HydraProvider,
  mnemonic: string,
  blockfrostKey: string,
  unsignedCbor: string,
  utxos: ReadonlyArray<UTxO.UTxO>,
): Promise<TransactionHash.TransactionHash> {
  const client = makeWalletClient(mnemonic, blockfrostKey);
  const witnessSet = await client.signTx(unsignedCbor, { utxos });
  const signedCbor = Transaction.addVKeyWitnessesHex(
    unsignedCbor,
    TransactionWitnessSet.toCBORHex(witnessSet),
  );
  return provider.submitTx(Transaction.fromCBORHex(signedCbor));
}

async function main() {
  const wsUrl = HYDRA_WS_URL();
  const httpUrl = HYDRA_HTTP_URL();
  const mnemonic = SEED_PHRASE();
  const blockfrostKey = BLOCKFROST_KEY();

  const walletAddress = await getWalletAddress(mnemonic, blockfrostKey);
  const paymentCred = walletAddress.paymentCredential;
  if (paymentCred._tag !== "KeyHash") {
    throw new Error("Expected KeyHash payment credential");
  }
  const keyHash = paymentCred as KeyHash.KeyHash;
  log("Wallet", { address: Address.toBech32(walletAddress) });

  // 1. Connect
  const { head, provider } = await connectHead(wsUrl, httpUrl);

  try {
    // 2. Init + Commit
    await initHead(head);
    await blueprintCommit(head, httpUrl, mnemonic, blockfrostKey);

    // 3. Create initial state UTxO with datum { counter: 0 }
    log("State", "Creating UTxO with counter = 0...");
    const l2Utxos = await provider.getSnapshotUtxos();
    const stateLovelace = 2_000_000n; // 2 ADA locked with the datum

    const createTx = await makeTxBuilder({ provider, network: "Preprod" })
      .payToAddress({
        address: walletAddress,
        assets: Assets.fromLovelace(stateLovelace),
        datum: counterDatum(0),
      })
      .addSigner({ keyHash })
      .build({
        changeAddress: walletAddress,
        availableUtxos: l2Utxos,
        drainTo: 0,
      });

    const createUnsigned = Transaction.toCBORHex(await createTx.toTransaction());
    const createHash = await signAndSubmit(
      provider,
      mnemonic,
      blockfrostKey,
      createUnsigned,
      l2Utxos,
    );
    log("State", `Created: ${TransactionHash.toHex(createHash)}`);

    // 4. Find the state UTxO (the one with inline datum)
    await new Promise((r) => setTimeout(r, 1000));
    const afterCreate = await provider.getSnapshotUtxos();

    const stateUtxo = afterCreate.find(
      (u) =>
        u.datumOption !== undefined &&
        u.datumOption._tag === "InlineDatum",
    );
    if (!stateUtxo) {
      throw new Error("State UTxO with inline datum not found in snapshot");
    }

    const currentDatum = stateUtxo.datumOption!;
    if (currentDatum._tag === "InlineDatum") {
      const counter = readCounter(currentDatum);
      log("State", {
        utxo: `${TransactionHash.toHex(stateUtxo.transactionId)}#${stateUtxo.index}`,
        counter: counter?.toString(),
        lovelace: formatAda(Assets.lovelaceOf(stateUtxo.assets)),
      });
    }

    // 5. Update state: spend old UTxO, create new one with counter = 1
    log("State", "Updating counter 0 → 1...");
    const updateUtxos = await provider.getSnapshotUtxos();

    const updateTx = await makeTxBuilder({ provider, network: "Preprod" })
      .collectFrom({ inputs: [stateUtxo] })
      .payToAddress({
        address: walletAddress,
        assets: Assets.fromLovelace(stateLovelace),
        datum: counterDatum(1),
      })
      .addSigner({ keyHash })
      .build({
        changeAddress: walletAddress,
        availableUtxos: updateUtxos,
        drainTo: 0,
      });

    const updateUnsigned = Transaction.toCBORHex(await updateTx.toTransaction());
    const updateHash = await signAndSubmit(
      provider,
      mnemonic,
      blockfrostKey,
      updateUnsigned,
      updateUtxos,
    );
    log("State", `Updated: ${TransactionHash.toHex(updateHash)}`);

    // 6. Verify updated state
    await new Promise((r) => setTimeout(r, 1000));
    const afterUpdate = await provider.getSnapshotUtxos();
    const updatedUtxo = afterUpdate.find(
      (u) =>
        u.datumOption !== undefined &&
        u.datumOption._tag === "InlineDatum",
    );
    if (updatedUtxo && updatedUtxo.datumOption?._tag === "InlineDatum") {
      const counter = readCounter(updatedUtxo.datumOption);
      log("Verify", {
        counter: counter?.toString(),
        utxo: `${TransactionHash.toHex(updatedUtxo.transactionId)}#${updatedUtxo.index}`,
      });
    } else {
      log("Verify", "WARNING: updated state UTxO not found");
    }

    // 7. Close and fanout
    await teardown(head);
  } catch (err) {
    console.error("Error:", err);
    await head.dispose();
    process.exit(1);
  }
}

main();
