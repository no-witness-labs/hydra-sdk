# @no-witness-labs/hydra-sdk-cli

CLI for managing Hydra head lifecycle, built on [`@no-witness-labs/hydra-sdk`](../hydra-sdk) and [`@effect/cli`](https://github.com/Effect-TS/effect/tree/main/packages/cli).

## Installation

```bash
# From the monorepo root — build and link globally
pnpm --filter @no-witness-labs/hydra-sdk-cli build
cd packages/hydra-sdk-cli && pnpm link --global

# Verify
hydra --help

# Unlink later
pnpm unlink --global @no-witness-labs/hydra-sdk-cli
```

## Configuration

The CLI uses a three-tier fallback for options: **CLI flag > environment variable > config file**.

Config file location: `~/.config/hydra-sdk/config.yaml`

### Config commands

```bash
hydra config set --key url --value ws://localhost:4001
hydra config set --key blockfrostKey --value preprodXXXXXX
hydra config set --key mnemonic --value "word1 word2 ... word24"
hydra config set --key network --value preprod

hydra config get --key url
hydra config list
hydra config path
hydra config remove --key url
```

### Environment variables

| Variable | Description |
|---|---|
| `HYDRA_NODE_URL` | Hydra node WebSocket URL |
| `HYDRA_MNEMONIC` | BIP39 seed phrase |
| `HYDRA_BLOCKFROST_KEY` | Blockfrost project ID |

## Usage

Every command that connects to a Hydra node accepts `--url` and `--json` flags. When configured via `hydra config set` or environment variables, `--url` can be omitted.

```bash
hydra status --url ws://localhost:4001
hydra status --json
```

## Commands

### Connection

```bash
# Test connection
hydra connect --url ws://localhost:4001

# Check head status
hydra status --url ws://localhost:4001

# Watch status continuously (1s interval)
hydra status --watch
```

### Head lifecycle

```bash
hydra init                          # Initialize a new head
hydra abort                         # Abort initialization
hydra close                         # Close the head
hydra contest                       # Contest closure with newer snapshot
hydra fanout                        # Fan out from closed head to L1
```

### Commits

```bash
# Empty commit
hydra commit

# Commit specific UTxOs (requires wallet credentials)
hydra commit \
  --utxo "txhash1#0,txhash2#1" \
  --mnemonic "word1 word2 ... word24" \
  --blockfrost-key preprodXXXXXX
```

### Incremental commits & decommits

```bash
# Recover a failed deposit
hydra recover --tx-id <deposit-tx-id>

# Decommit UTxOs back to L1
hydra decommit --tx-cbor <cbor-hex> --tx-id <tx-id>
```

### UTxO queries

```bash
# List L1 wallet UTxOs
hydra l1-utxo --mnemonic "..." --blockfrost-key preprodXXXXXX

# List L2 UTxOs in the head snapshot
hydra l2-utxo --url ws://localhost:4001
```

### TUI

Interactive terminal UI for real-time head monitoring. Press `q` to quit.

```bash
hydra tui --url ws://localhost:4001
```

## Full lifecycle example

```bash
export HYDRA_NODE_URL=ws://localhost:4001

hydra connect            # verify connection
hydra init               # initialize head
hydra commit             # commit (empty or with UTxOs)
# ... wait for all participants to commit ...
hydra status --watch     # monitor until Open
hydra close              # close head
hydra status --watch     # monitor contestation period
hydra fanout             # fan out to L1
```
