# @no-witness-labs/hydra-sdk-cli

CLI for managing Hydra head lifecycle, built on [`@no-witness-labs/hydra-sdk`](../hydra-sdk) and [`@effect/cli`](https://github.com/Effect-TS/effect/tree/main/packages/cli).

## Installation

```bash
# Global install
npm i -g @no-witness-labs/hydra-sdk-cli

# Or run directly
npx @no-witness-labs/hydra-sdk-cli --help
```

## Usage

Every command requires a Hydra node WebSocket URL, provided via `--url` or the `HYDRA_NODE_URL` environment variable:

```bash
# Using --url flag
hydra status --url ws://localhost:4001

# Using environment variable
export HYDRA_NODE_URL=ws://localhost:4001
hydra status
```

Add `--json` to any command for machine-readable JSON output:

```bash
hydra status --json
```

## Commands

### status

Show current head status.

```bash
hydra status --url ws://localhost:4001

# Watch mode — polls every 1s
hydra status --url ws://localhost:4001 --watch
```

### connect

Test connection to a Hydra node without performing any action.

```bash
hydra connect --url ws://localhost:4001
```

### init

Initialize a new Hydra head.

```bash
hydra init --url ws://localhost:4001
```

### abort

Abort head initialization (before all participants have committed).

```bash
hydra abort --url ws://localhost:4001
```

### commit

Send an empty commit to the head (via REST).

```bash
hydra commit --url ws://localhost:4001
```

### close

Close the Hydra head, initiating the contestation period.

```bash
hydra close --url ws://localhost:4001
```

### contest

Contest head closure with a newer snapshot during the contestation period.

```bash
hydra contest --url ws://localhost:4001
```

### fanout

Fan out from a closed head back to L1 (after contestation period ends).

```bash
hydra fanout --url ws://localhost:4001
```

### recover

Recover a failed incremental commit deposit.

```bash
hydra recover --url ws://localhost:4001 --tx-id <TRANSACTION_ID>
```

### decommit

Decommit UTxOs from the head back to L1.

```bash
hydra decommit --url ws://localhost:4001 --tx-id <TX_ID> --tx-cbor <CBOR_HEX>
```

## Full Lifecycle Example

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
