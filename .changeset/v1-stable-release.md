---
"@no-witness-labs/hydra-sdk": major
"@no-witness-labs/hydra-sdk-cli": major
---

v1.0.0 — first stable release.

The public API is now considered stable and versioned under semantic versioning:

- Hydra Head lifecycle management (init, commit, incremental commit/decommit, close, contest, fanout, abort) targeting hydra-node v1.2.0
- `HydraStateMachine` with typed head-state transitions and event subscriptions
- Provider layer: `HydraProvider` (evolution-sdk) and `HydraMeshProvider` (MeshJS) adapters behind one interface
- Automatic WebSocket connection recovery
- CLI with standalone binaries for linux-x64/arm64, darwin-x64/arm64, and windows-x64

From this release on, breaking changes to any documented API will only ship in a new major version, per semver.
