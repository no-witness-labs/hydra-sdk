# @no-witness-labs/hydra-devnet

## 0.1.0

### Minor Changes

- 28c2500: Support hydra-node v2.x (tested against v2.3.0). Heads now open directly — the v2 protocol removes the commit phase (ADR-33), so funds are added via incremental `deposit` transactions.

  **Breaking changes:**
  - `head.abort()` and the CLI `abort` command are removed (no `abort` transaction in the v2 protocol)
  - `HeadIsFinalized` server output: `utxo` renamed to `finalizedUTxO` (hydra-node 2.2.0)
  - `Greetings.headStatus` no longer includes `"Final"` — v2 nodes return to `Idle` after fanout; the SDK's own `Final` head state (from `HeadIsFinalized`) is unchanged
  - Head lifecycle simplified: `Initializing` phase removed from the state machine
  - `hydra-devnet` default images: `hydra-node:2.3.0` and `cardano-node:11.0.1`

## 0.0.2

### Patch Changes

- fc3f362: Add CLI binary compilation with Bun for cross-platform standalone executables. Release workflow now builds and uploads binaries (linux-x64, linux-arm64, darwin-arm64, darwin-x64, windows-x64) to GitHub Releases. Fix repository fields and bin configuration for npm publishing with provenance.

## 0.0.1

### Patch Changes

- Initial release — Docker-based Cardano + Hydra cluster for local development
