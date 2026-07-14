# @no-witness-labs/hydra-sdk

## 1.0.0

### Major Changes

- d4f2804: v1.0.0 — first stable release.

  The public API is now considered stable and versioned under semantic versioning:
  - Hydra Head lifecycle management (init, commit, incremental commit/decommit, close, contest, fanout, abort) targeting hydra-node v1.2.0
  - `HydraStateMachine` with typed head-state transitions and event subscriptions
  - Provider layer: `HydraProvider` (evolution-sdk) and `HydraMeshProvider` (MeshJS) adapters behind one interface
  - Automatic WebSocket connection recovery
  - CLI with standalone binaries for linux-x64/arm64, darwin-x64/arm64, and windows-x64

  From this release on, breaking changes to any documented API will only ship in a new major version, per semver.

### Minor Changes

- 78afe9c: Add MeshJS provider adapter (HydraMeshProvider)
  - New `HydraMeshProvider` class implementing `IFetcher`, `ISubmitter`, `IEvaluator`, and `IListener` from `@meshsdk/common`
  - Bidirectional UTxO converters between hydra-node and MeshJS formats (`mesh-utxo.ts`)
  - New `./mesh-provider` subpath export for tree-shakeable MeshJS integration
  - `@meshsdk/common` added as optional peer dependency
  - SDK now supports 2 provider adapters: evolution-sdk (`HydraProvider`) and MeshJS (`HydraMeshProvider`)
  - Cross-browser test report artifacts published in CI

## 0.0.4

### Patch Changes

- fc3f362: Add CLI binary compilation with Bun for cross-platform standalone executables. Release workflow now builds and uploads binaries (linux-x64, linux-arm64, darwin-arm64, darwin-x64, windows-x64) to GitHub Releases. Fix repository fields and bin configuration for npm publishing with provenance.

## 0.0.3

### Patch Changes

- 1740fd6: Added HydraStateMachine

## 0.0.2

### Patch Changes

- 9057eb8: new names for the packages
- 1493aee: Socket wrapper implementation
