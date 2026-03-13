/**
 * Mint and burn tokens inside a Hydra Head.
 *
 * Full lifecycle: connect → init → commit → mint tokens on L2 → burn tokens → close → fanout.
 *
 * Uses a native script minting policy (pubkey-based) so the wallet can sign the mint.
 * Tokens MUST be burned before closing the head — Hydra does not allow fanout with
 * minted-but-unburned tokens.
 *
 * Usage:
 *   cp .env.example .env   # fill in values
 *   pnpm mint-burn
 */
import {
  Address,
  AssetName,
  Assets,
  KeyHash,
  NativeScripts,
  PolicyId,
  ScriptHash,
  Transaction,
  TransactionHash,
  TransactionWitnessSet,
} from "@evolution-sdk/evolution";
import { makeTxBuilder } from "@evolution-sdk/evolution/sdk/builders/TransactionBuilder";
import { Provider } from "@no-witness-labs/hydra-sdk";
import {
  blueprintCommit,
  connectHead,
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

  const walletAddress = await getWalletAddress(mnemonic, blockfrostKey);
  const paymentCred = walletAddress.paymentCredential;
  if (paymentCred._tag !== "KeyHash") {
    throw new Error("Expected KeyHash payment credential");
  }
  const keyHash = paymentCred as KeyHash.KeyHash;
  log("Wallet", { address: Address.toBech32(walletAddress) });

  // Create a native script minting policy: requires wallet's payment key signature
  const mintingScript = NativeScripts.makeScriptPubKey(keyHash.hash);
  const scriptHash = ScriptHash.fromScript(mintingScript);
  const policyId = PolicyId.fromHex(ScriptHash.toHex(scriptHash));
  const tokenNameHex = Buffer.from("HydraToken").toString("hex");
  const tokenName = AssetName.fromHex(tokenNameHex);
  const mintAmount = 100n;

  log("Policy", {
    policyId: PolicyId.toHex(policyId),
    tokenName: "HydraToken",
    amount: mintAmount.toString(),
  });

  // 1. Connect
  const { head, provider } = await connectHead(wsUrl, httpUrl);

  try {
    // 2. Init + Commit
    await initHead(head);
    await blueprintCommit(head, httpUrl, mnemonic, blockfrostKey);

    // 3. Mint tokens on L2
    log("Mint", `Minting ${mintAmount} HydraToken...`);
    const l2Utxos = await provider.getSnapshotUtxos();

    const mintAssets = Assets.fromAsset(policyId, tokenName, mintAmount);

    const mintTx = await makeTxBuilder({ provider, network: "Preprod" })
      .attachScript({ script: mintingScript })
      .mintAssets({ assets: mintAssets })
      .payToAddress({
        address: walletAddress,
        assets: Assets.merge(Assets.fromLovelace(2_000_000n), mintAssets),
      })
      .addSigner({ keyHash })
      .build({
        changeAddress: walletAddress,
        availableUtxos: l2Utxos,
        drainTo: 0,
      });

    const mintUnsigned = await mintTx.toTransaction();
    const mintCbor = Transaction.toCBORHex(mintUnsigned);

    const client = makeWalletClient(mnemonic, blockfrostKey);
    const mintWitness = await client.signTx(mintCbor, { utxos: l2Utxos });
    const mintSigned = Transaction.addVKeyWitnessesHex(
      mintCbor,
      TransactionWitnessSet.toCBORHex(mintWitness),
    );

    const mintHash = await provider.submitTx(Transaction.fromCBORHex(mintSigned));
    log("Mint", `TX confirmed: ${TransactionHash.toHex(mintHash)}`);

    // 4. Verify minted tokens in L2 snapshot
    await new Promise((r) => setTimeout(r, 1000));
    const afterMint = await provider.getSnapshotUtxos();
    const policyHex = PolicyId.toHex(policyId);
    const tokenHex = AssetName.toHex(tokenName);
    const tokenUtxo = afterMint.find((u) => {
      const flat = Assets.flatten(u.assets);
      return flat.some(
        ([pid, name]) =>
          PolicyId.toHex(pid) === policyHex &&
          AssetName.toHex(name) === tokenHex,
      );
    });
    if (tokenUtxo) {
      log("Verify", "Minted tokens found in L2 snapshot");
    } else {
      log("Verify", "WARNING: minted tokens not found in snapshot");
    }

    // 5. Burn tokens before closing (required by Hydra protocol)
    log("Burn", `Burning ${mintAmount} HydraToken...`);
    const burnUtxos = await provider.getSnapshotUtxos();

    const burnAssets = Assets.fromAsset(policyId, tokenName, -mintAmount);

    const burnTx = await makeTxBuilder({ provider, network: "Preprod" })
      .attachScript({ script: mintingScript })
      .mintAssets({ assets: burnAssets })
      .addSigner({ keyHash })
      .build({
        changeAddress: walletAddress,
        availableUtxos: burnUtxos,
        drainTo: 0,
      });

    const burnUnsigned = await burnTx.toTransaction();
    const burnCbor = Transaction.toCBORHex(burnUnsigned);

    const burnWitness = await client.signTx(burnCbor, { utxos: burnUtxos });
    const burnSigned = Transaction.addVKeyWitnessesHex(
      burnCbor,
      TransactionWitnessSet.toCBORHex(burnWitness),
    );

    const burnHash = await provider.submitTx(Transaction.fromCBORHex(burnSigned));
    log("Burn", `TX confirmed: ${TransactionHash.toHex(burnHash)}`);

    // 6. Verify tokens are burned
    await new Promise((r) => setTimeout(r, 1000));
    const afterBurn = await provider.getSnapshotUtxos();
    const stillHasTokens = afterBurn.some((u) =>
      Assets.flatten(u.assets).some(
        ([pid]) => PolicyId.toHex(pid) === policyHex,
      ),
    );
    log("Verify", stillHasTokens ? "WARNING: tokens still present" : "All tokens burned");

    // 7. Close and fanout
    await teardown(head);
  } catch (err) {
    console.error("Error:", err);
    await head.dispose();
    process.exit(1);
  }
}

main();
