/**
 * Transfer ADA between two addresses inside a Hydra Head.
 *
 * Full lifecycle: connect → init → commit → send ADA on L2 → close → fanout.
 *
 * Usage:
 *   cp .env.example .env   # fill in values
 *   pnpm transfer
 */
import {
  Address,
  Assets,
  KeyHash,
  Transaction,
  TransactionHash,
  TransactionWitnessSet,
} from "@evolution-sdk/evolution";
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

async function main() {
  const wsUrl = HYDRA_WS_URL();
  const httpUrl = HYDRA_HTTP_URL();
  const mnemonic = SEED_PHRASE();
  const blockfrostKey = BLOCKFROST_KEY();

  // Derive wallet address (sender = recipient in this demo, but on L2 the UTxO set changes)
  const senderAddress = await getWalletAddress(mnemonic, blockfrostKey);
  log("Wallet", { address: Address.toBech32(senderAddress) });

  // 1. Connect
  const { head, provider } = await connectHead(wsUrl, httpUrl);

  try {
    // 2. Init
    await initHead(head);

    // 3. Commit (blueprint commit with wallet UTxOs)
    await blueprintCommit(head, httpUrl, mnemonic, blockfrostKey);

    // 4. Check L2 UTxOs
    const l2Utxos = await provider.getSnapshotUtxos();
    const totalL2 = l2Utxos.reduce(
      (sum, u) => sum + Assets.lovelaceOf(u.assets),
      0n,
    );
    log("L2 Balance", formatAda(totalL2));
    log("L2 UTxOs", l2Utxos.length);

    // 5. Send ADA on L2 (send to self — demonstrates the transfer flow)
    const sendAmount = 2_000_000n; // 2 ADA
    log("Transfer", `Sending ${formatAda(sendAmount)} on L2...`);

    const paymentCred = senderAddress.paymentCredential;
    if (paymentCred._tag !== "KeyHash") {
      throw new Error("Expected KeyHash payment credential");
    }

    const built = await makeTxBuilder({ provider, network: "Preprod" })
      .payToAddress({
        address: senderAddress,
        assets: Assets.fromLovelace(sendAmount),
      })
      .addSigner({ keyHash: paymentCred as KeyHash.KeyHash })
      .build({
        changeAddress: senderAddress,
        availableUtxos: l2Utxos,
        drainTo: 0,
      });

    const unsignedTx = await built.toTransaction();
    const unsignedCbor = Transaction.toCBORHex(unsignedTx);

    // Sign with evolution-sdk wallet
    const client = makeWalletClient(mnemonic, blockfrostKey);
    const witnessSet = await client.signTx(unsignedCbor, { utxos: l2Utxos });
    const witnessHex = TransactionWitnessSet.toCBORHex(witnessSet);
    const signedCbor = Transaction.addVKeyWitnessesHex(
      unsignedCbor,
      witnessHex,
    );
    const signedTx = Transaction.fromCBORHex(signedCbor);

    // Submit to Hydra head
    const txHash = await provider.submitTx(signedTx);
    log("Transfer", `TX confirmed: ${TransactionHash.toHex(txHash)}`);

    // 6. Verify updated L2 UTxOs
    await new Promise((r) => setTimeout(r, 1000));
    const updatedUtxos = await provider.getSnapshotUtxos();
    const updatedTotal = updatedUtxos.reduce(
      (sum, u) => sum + Assets.lovelaceOf(u.assets),
      0n,
    );
    log("L2 Balance (after)", formatAda(updatedTotal));
    log("L2 UTxOs (after)", updatedUtxos.length);

    // 7. Close and fanout
    await teardown(head);
  } catch (err) {
    console.error("Error:", err);
    await head.dispose();
    process.exit(1);
  }
}

main();
