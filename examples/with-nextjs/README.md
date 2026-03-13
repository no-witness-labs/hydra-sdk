# Hydra Head — Next.js Full-Stack Example

A full-stack example with server-side Hydra head management and a client-side UI. The server maintains the head connection and exposes REST API routes; the client renders state and triggers actions.

## Prerequisites

- A running **hydra-node** (v1.2.0) reachable via WebSocket and HTTP
- A **preprod** wallet funded with at least **3 UTxOs**
- [Blockfrost](https://blockfrost.io/) preprod API key
- Node.js >= 18

## Quick Start

```bash
# From the repository root
pnpm install

# Copy and configure environment
cp examples/with-nextjs/.env.example examples/with-nextjs/.env
# Edit .env with your values

# Start the dev server
pnpm --filter @no-witness-labs/example-with-nextjs dev
```

The app opens at `http://localhost:3000`.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `HYDRA_WS_URL` | WebSocket URL of the hydra-node |
| `HYDRA_HTTP_URL` | HTTP URL of the hydra-node |
| `SEED_PHRASE` | BIP39 mnemonic for the wallet (used server-side for commit) |
| `BLOCKFROST_KEY` | Blockfrost project ID for preprod |

## Architecture

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────┐
│   Browser (UI)   │────▶│  Next.js Server  │────▶│  hydra-node  │
│                  │     │   API Routes     │     │  (WS + HTTP) │
│  - State display │     │   - /api/head    │     └──────────────┘
│  - Action buttons│     │   - /api/utxos   │
│  - Event log     │     │                  │
└──────────────────┘     │  lib/hydra.ts    │
                         │  (head singleton)│
                         └──────────────────┘
```

**Server** (`lib/hydra.ts`):
- Manages a singleton `HydraHead` + `HydraProvider`
- Handles blueprint commit (build, sign, submit to L1)
- Exposes head state and L2 UTxOs

**Client** (`app/page.tsx`):
- Polls `/api/head` for state updates
- Triggers actions via POST to `/api/head`
- Displays L2 UTxOs from `/api/utxos`

## API Routes

### `GET /api/head`
Returns current head state and ID.

```json
{ "state": "Open", "headId": "abc123..." }
```

### `POST /api/head`
Execute a head action. Body: `{ "action": "<action>" }`

| Action | Description |
|--------|-------------|
| `connect` | Connect to hydra-node via WebSocket |
| `disconnect` | Disconnect and dispose head |
| `init` | Initialize a new head |
| `commit` | Blueprint commit (server-side wallet) |
| `close` | Close the head |
| `fanout` | Fanout after contestation |
| `abort` | Abort initialization |

### `GET /api/utxos`
Returns L2 snapshot UTxOs (when head is Open).

```json
{
  "utxos": [
    { "txHash": "abc...", "index": 0, "lovelace": "5000000" }
  ]
}
```

## Project Structure

```
app/
├── layout.tsx              # Root layout
├── page.tsx                # Client-side UI (state, actions, UTxO table, log)
└── api/
    ├── head/route.ts       # Head lifecycle API
    └── utxos/route.ts      # L2 UTxO query
lib/
└── hydra.ts                # Server-side head singleton + blueprint commit
```

## Extending This Example

- **Add client-side L2 transactions** — Connect a CIP-30 wallet in the browser and submit L2 transactions directly via `HydraProvider` (see the `with-vite-react` example)
- **Add WebSocket streaming** — Use Next.js server actions or a WebSocket endpoint to stream head events to the client in real-time
- **Multi-head management** — Extend `lib/hydra.ts` to manage multiple heads keyed by ID
- **Authentication** — Add auth middleware to protect the API routes
