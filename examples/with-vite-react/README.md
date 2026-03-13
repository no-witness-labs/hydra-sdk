# Hydra Head Lifecycle — Vite + React Example

A browser-based demo that walks through the full Hydra Head lifecycle using a CIP-30 wallet (e.g. Eternl, Nami). Covers head initialization, UTxO commit, L2 transactions, decommit, and fanout.

## Prerequisites

- A running **hydra-node** (v1.2.0) reachable via WebSocket
- A CIP-30 browser wallet connected to **preprod**
- Wallet funded with at least **two UTxOs** (one to commit, one for fee coverage)
- [Blockfrost](https://blockfrost.io/) preprod API key

## Quick Start

```bash
# From the repository root
pnpm install

# Copy and fill in environment variables
cp examples/with-vite-react/.env.example examples/with-vite-react/.env

# Start the dev server
pnpm --filter @no-witness-labs/example-with-vite-react dev
```

The app opens at `http://localhost:5173`.

## Environment Variables

Copy `.env.example` to `.env` and fill in:

```env
VITE_HYDRA_NODE_URL=ws://<hydra-node-host>:4001
VITE_BLOCKFROST_KEY_PREPROD=<your-blockfrost-project-id>
```

| Variable | Description |
|----------|-------------|
| `VITE_HYDRA_NODE_URL` | WebSocket URL of the hydra-node (e.g. `ws://localhost:4001`) |
| `VITE_BLOCKFROST_KEY_PREPROD` | Blockfrost project ID for preprod — used to fetch wallet UTxOs on L1 |

## Project Structure

```
src/
├── App.tsx                    # Root component — wallet + head layout
├── main.tsx                   # React entry point
├── ws-shim.ts                 # WebSocket polyfill for browser compatibility
└── components/
    ├── WalletConnect.tsx       # CIP-30 wallet connection (Eternl, Nami, etc.)
    └── HydraCommit.tsx        # Head lifecycle + L2 operations
```

## Features

### Head Lifecycle (L1)

| Action | State Required | Description |
|--------|---------------|-------------|
| **Connect** | — | Opens WebSocket to hydra-node, subscribes to events |
| **Init** | `Idle` | Initializes a new head on L1 |
| **Fetch UTxOs** | Any | Queries wallet for available L1 UTxOs |
| **Commit** | `Initializing` | Locks selected UTxOs into the head via L1 commit tx |
| **Close** | `Open` | Closes the head, starts contestation period |
| **SafeClose** | `Open` | Graceful close — waits for pending transactions |
| **Contest** | `Closed` | Contest with a newer snapshot (if available) |
| **Fanout** | `FanoutPossible` | Distributes final UTxOs back to L1 |
| **Abort** | `Idle` / `Initializing` | Cancels initialization, refunds committed UTxOs |

### L2 Operations (inside an Open head)

| Action | Description |
|--------|-------------|
| **Send ADA** | Transfer ADA to another address within the head — zero fees, instant finality |
| **Decommit** | Withdraw ADA from the head back to L1 (incremental decommit) |
| **Recover** | Reclaim a failed incremental commit deposit by tx ID |
| **Refresh L2** | Fetch current L2 snapshot UTxOs and balances |

The app displays both **L1 wallet balance** and **L2 head balance** when connected.

### Wallet Connection

Uses `@cardano-foundation/cardano-connect-with-wallet` for CIP-30 integration. Supports any preprod-compatible wallet extension (Eternl, Nami, Lace, Flint, Typhon, VESPR, etc.).

## Lifecycle Flow

### 1. Connect

Enter the Hydra node WebSocket URL and click **Connect**. The app opens a WebSocket connection and subscribes to head state events. The initial state is synced from the node's `Greetings` message.

### 2. Init

Click **Init** (available when state is `Idle`). This posts an `Init` command to the Hydra node, which submits an L1 transaction to initialize a new head. The state transitions to `Initializing` once the init tx is observed on-chain.

### 3. Fetch UTxOs & Commit

Click **Fetch UTxOs** to query the wallet for available UTxOs. Select the ones you want to commit.

> **Important:** Keep at least one UTxO unselected — it will be automatically used for fee coverage on the commit transaction.

Click **Commit** to lock the selected UTxOs into the head. The commit flow:

1. Builds a blueprint transaction with the selected + fee UTxOs
2. POSTs to the hydra-node `/commit` endpoint
3. Signs the returned draft L1 transaction via the wallet
4. Submits the signed commit tx on-chain

Once all participants commit, the head transitions to `Open`.

### 4. L2 Transactions

With the head `Open`, you can:

- **Send ADA** — Enter a recipient address and amount, then click Send. The transaction is built with `evolution-sdk`, signed by the wallet, and submitted to the head via `HydraProvider.submitTx()`. No fees, instant confirmation.
- **Decommit** — Withdraw ADA from the head back to your L1 address.
- **Recover** — If an incremental commit deposit fails, paste the deposit tx ID to reclaim it.

### 5. Close & Fanout

Click **Close** (or **SafeClose**) to close the head. After the contestation period, click **Fanout** to distribute the final UTxO set back to L1.

## State Machine

```
Idle → Init → Initializing → Commit → Open → Close → Closed → FanoutPossible → Fanout → Final
                    ↓                    ↑
                  Abort              Decommit
                                     Recover
```

## Vite Proxy

In development, the Vite dev server proxies `/hydra/*` requests to the hydra-node HTTP API. This avoids CORS issues when the hydra-node is on a remote host. Configure the proxy target in `vite.config.ts`:

```ts
server: {
  proxy: {
    "/hydra": {
      target: "http://<hydra-node-host>:4001",
      changeOrigin: true,
      rewrite: (p) => p.replace(/^\/hydra/, ""),
    },
  },
},
```

## Key SDK Patterns Used

```ts
import { Head, Provider } from "@no-witness-labs/hydra-sdk";

// Connect to hydra-node
const head = await Head.create({ url: "ws://localhost:4001" });

// Create L2 provider (same interface as Blockfrost, Kupmios, etc.)
const provider = new Provider.HydraProvider({
  head,
  httpUrl: "http://localhost:4001",
});

// Subscribe to events
head.subscribe((event) => {
  console.log(event.tag, event.payload);
});

// Build and submit L2 transaction with evolution-sdk
const tx = await makeTxBuilder({ provider, network: "Preprod" })
  .payToAddress({ address, assets })
  .addSigner({ keyHash })
  .build({ changeAddress, availableUtxos: l2Utxos, drainTo: 0 });

const signed = Transaction.addVKeyWitnessesHex(
  Transaction.toCBORHex(await tx.toTransaction()),
  await walletApi.signTx(cbor, true),
);
const txHash = await provider.submitTx(Transaction.fromCBORHex(signed));
```

## Extending This Example

This example is intentionally minimal. To build on it:

- **Add token minting** — Use `evolution-sdk` `MintBuilder` to mint/burn tokens on L2
- **Add datum-based state** — Attach inline datums to UTxOs for on-chain state machines
- **Multi-participant** — Run multiple browser tabs with different wallets against the same head
- **Production deployment** — See the [Production Checklist](https://github.com/no-witness-labs/hydra-sdk/blob/main/docs/content/docs/providers/production-checklist.mdx) for TLS, monitoring, and error handling
