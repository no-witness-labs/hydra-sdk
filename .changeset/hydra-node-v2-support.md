---
"@no-witness-labs/hydra-sdk": major
"@no-witness-labs/hydra-sdk-cli": major
"@no-witness-labs/hydra-devnet": minor
---

Support hydra-node v2.x (tested against v2.3.0). Heads now open directly — the v2 protocol removes the commit phase (ADR-33), so funds are added via incremental `deposit` transactions.

**Breaking changes:**

- `head.abort()` and the CLI `abort` command are removed (no `abort` transaction in the v2 protocol)
- `HeadIsFinalized` server output: `utxo` renamed to `finalizedUTxO` (hydra-node 2.2.0)
- `Greetings.headStatus` no longer includes `"Final"` — v2 nodes return to `Idle` after fanout; the SDK's own `Final` head state (from `HeadIsFinalized`) is unchanged
- Head lifecycle simplified: `Initializing` phase removed from the state machine
- `hydra-devnet` default images: `hydra-node:2.3.0` and `cardano-node:11.0.1`
