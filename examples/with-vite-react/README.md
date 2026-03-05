# Hydra Head Lifecycle — Vite + React Example

A browser-based demo that walks through the full Hydra Head lifecycle using a CIP-30 wallet (e.g. Eternl, Nami).

## Prerequisites

- A running **hydra-node** (v1.2.0) reachable via WebSocket
- A CIP-30 browser wallet connected to **preprod**
- Wallet funded with at least **two UTxOs** (one to commit, one for fee coverage)
- Blockfrost preprod API key

## Environment Variables

```env
VITE_HYDRA_NODE_URL=ws://<hydra-node-host>:4001
VITE_BLOCKFROST_KEY_PREPROD=<your-blockfrost-project-id>
```

## Lifecycle Flow

### 1. Connect

Enter the Hydra node WebSocket URL and click **Connect**. The app opens a WebSocket connection and subscribes to head state events. The initial state is synced from the node's `Greetings` message.

### 2. Init

Click **Init** (available when state is `Idle`). This posts an `Init` command to the Hydra node, which submits an L1 transaction to initialize a new head. The state transitions to `Initializing` once the init tx is observed on-chain.

### 3. Fetch UTxOs

Click **Fetch UTxOs** to query the CIP-30 wallet for available UTxOs. They are displayed with ADA amounts and native assets. Select the UTxOs you want to commit to the head.

> **Important:** Keep at least one UTxO unselected — it will be automatically used for fee coverage on the commit transaction.

### 4. Commit

Click **Commit** (available when state is `Initializing`). This:

1. **Selects a fee UTxO** — automatically picks an unselected wallet UTxO (>= 2 ADA)
2. **Builds a blueprint transaction** — a Conway-era tx with the selected + fee UTxOs as inputs, sent to hydra-node as a template
3. **POST /commit** — sends the blueprint tx and UTxO map to the hydra-node HTTP API
4. **Signs the draft commit tx** — the hydra-node returns a draft L1 transaction; the wallet signs it via `signTx(cbor, partial=true)`
5. **Submits to L1** — the signed commit tx is submitted on-chain via the wallet

The signing step uses raw CBOR manipulation (not Schema round-trip) to preserve the exact byte encoding of the transaction body and witness set. This is critical for script integrity hash validation.

Once all participants commit, the head transitions to `Open`.

### 5. Close

Click **Close** (available when state is `Open`). Posts a `Close` command to the hydra-node, which submits an L1 close transaction. The state transitions to `Closed` and a contestation countdown timer appears.

### 6. Fanout

Click **Fanout** (available when state is `FanoutPossible`, after the contestation period expires). This submits an L1 fanout transaction that distributes the final UTxO set back to L1.

### 7. Abort

Click **Abort** (available when state is `Idle` or `Initializing`). Aborts the head initialization and refunds any committed UTxOs.

## State Machine

```
Idle → Init → Initializing → Commit → Open → Close → Closed → FanoutPossible → Fanout → Final
                    ↓
                  Abort
```

## Development

```bash
pnpm install
pnpm dev
```

The Vite dev server proxies `/hydra/*` requests to the hydra-node HTTP API (configured in `vite.config.ts`).
