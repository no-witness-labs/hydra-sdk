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

### 5. L2 Operations (while head is Open)

#### Send on L2

Enter a recipient address and ADA amount, then click **Send**. This builds a transaction using L2 UTxOs, signs it with the wallet, and submits it to the Hydra head via `NewTx`. L2 transactions are instant and fee-free.

#### Decommit

Enter an ADA amount and click **Decommit** to withdraw funds from L2 back to L1. The SDK sends a `Decommit` command with the signed transaction to the Hydra node.

#### Recover

If an incremental commit deposit fails or expires, enter the deposit transaction ID and click **Recover** to reclaim the deposited UTxOs on L1.

### 6. Close / SafeClose

- **Close** (available when state is `Open`) — posts a `Close` command to the hydra-node, which submits an L1 close transaction. The state transitions to `Closed` and the contestation period begins.
- **SafeClose** (available when state is `Open`) — same as Close but verifies the confirmed snapshot does not contain non-ADA assets before closing, preventing potential asset lockup.

### 7. Contest

Click **Contest** (available when state is `Closed`). Challenges the closed snapshot with a more recent one during the contestation period. Use this if you observe a closure with an outdated snapshot.

### 8. Fanout

Click **Fanout** (available when state is `FanoutPossible`, after the contestation period expires). This submits an L1 fanout transaction that distributes the final UTxO set back to L1.

### 9. Abort

Click **Abort** (available when state is `Idle` or `Initializing`). Aborts the head initialization and refunds any committed UTxOs.

## State Machine

```
Idle → Init → Initializing → Commit → Open → Close → Closed → Contest → Closed
                    ↓                    ↓                         ↓
                  Abort            SafeClose                 ReadyToFanout
                                                                  ↓
                                                          FanoutPossible → Fanout → Final
```

## Development

```bash
pnpm install
pnpm dev
```

The Vite dev server proxies `/hydra/*` requests to the hydra-node HTTP API (configured in `vite.config.ts`).
