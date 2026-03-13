# Node.js Script Examples

Three standalone scripts demonstrating hydra-sdk usage from Node.js. Each runs the full Hydra Head lifecycle: connect, init, commit, L2 operation, close, and fanout.

## Prerequisites

- A running **hydra-node** (v1.2.0) reachable via WebSocket and HTTP
- A **preprod** wallet funded with at least **3 UTxOs** (one to commit, one for fees, one spare)
- [Blockfrost](https://blockfrost.io/) preprod API key
- Node.js >= 18

## Setup

```bash
# From the repository root
pnpm install

# Copy and configure environment
cp examples/node-scripts/.env.example examples/node-scripts/.env
# Edit .env with your values
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `HYDRA_WS_URL` | WebSocket URL of the hydra-node (e.g. `ws://38.242.137.103:4001`) |
| `HYDRA_HTTP_URL` | HTTP URL of the hydra-node (e.g. `http://38.242.137.103:4001`) |
| `SEED_PHRASE` | BIP39 mnemonic (24 words) for the wallet |
| `BLOCKFROST_KEY` | Blockfrost project ID for preprod |

## Examples

### Transfer (`pnpm transfer`)

Sends ADA between addresses inside a Hydra Head.

**Flow:**
1. Derive wallet address from seed phrase
2. Init head and commit wallet UTxOs (blueprint commit)
3. Build and sign an L2 transfer transaction with `evolution-sdk`
4. Submit via `HydraProvider.submitTx()` — zero fees, instant confirmation
5. Verify updated L2 UTxO set
6. Close head and fanout back to L1

### Mint/Burn (`pnpm mint-burn`)

Mint and burn tokens on L2 using a native script minting policy.

**Flow:**
1. Create a native script policy (requires wallet's payment key)
2. Init head and commit wallet UTxOs
3. Mint tokens on L2 — submit minting transaction
4. Verify minted tokens in the L2 snapshot
5. Burn all minted tokens (required before closing — Hydra does not allow fanout with unburned tokens)
6. Close head and fanout

### State Update (`pnpm state-update`)

Datum-based state machine update pattern on L2.

**Flow:**
1. Init head and commit wallet UTxOs
2. Create a UTxO with inline datum `{ counter: 0 }` (2 ADA locked)
3. Spend the state UTxO and recreate with `{ counter: 1 }`
4. Verify the updated datum in the L2 snapshot
5. Close head and fanout

## Project Structure

```
src/
├── common.ts         # Shared: wallet client, head lifecycle helpers, blueprint commit
├── transfer.ts       # Send ADA on L2
├── mint-burn.ts      # Mint and burn tokens on L2
└── state-update.ts   # Datum-based state update on L2
```

## Key SDK Patterns

### Blueprint Commit (L1 → L2)

```ts
import { Head, Provider } from "@no-witness-labs/hydra-sdk";
import { createClient, Transaction, TransactionWitnessSet } from "@evolution-sdk/evolution";

const client = createClient({
  network: "preprod",
  provider: { type: "blockfrost", baseUrl: "...", projectId: key },
  wallet: { type: "seed", mnemonic },
});

// Build blueprint, POST /commit, sign draft, submit to L1
const built = await client.newTx().collectFrom({ inputs: utxos }).build();
const blueprintCbor = Transaction.toCBORHex(await built.toTransaction());

const draftTx = await Effect.runPromise(
  Provider.postCommit(httpUrl, { blueprintTx: { ... }, utxo: utxoMap })
);

const witnessSet = await client.signTx(draftTx.cborHex, { utxos });
const signed = Transaction.addVKeyWitnessesHex(draftTx.cborHex, witnessHex);
// Submit signed CBOR to Blockfrost
```

### L2 Transaction (inside Open head)

```ts
import { makeTxBuilder } from "@evolution-sdk/evolution/sdk/builders/TransactionBuilder";

const tx = await makeTxBuilder({ provider, network: "Preprod" })
  .payToAddress({ address, assets })
  .addSigner({ keyHash })
  .build({ changeAddress, availableUtxos: l2Utxos, drainTo: 0 });

const unsigned = Transaction.toCBORHex(await tx.toTransaction());
const witnessSet = await client.signTx(unsigned, { utxos: l2Utxos });
const signed = Transaction.addVKeyWitnessesHex(unsigned, witnessHex);
const txHash = await provider.submitTx(Transaction.fromCBORHex(signed));
```

### Close and Fanout (L2 → L1)

```ts
await head.close();
// Wait for contestation period...
await head.fanout();
// UTxOs are back on L1
```
