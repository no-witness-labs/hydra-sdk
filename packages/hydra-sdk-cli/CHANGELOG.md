# @no-witness-labs/hydra-sdk-cli

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

### Patch Changes

- Updated dependencies [78afe9c]
- Updated dependencies [d4f2804]
  - @no-witness-labs/hydra-sdk@1.0.0

## 0.1.1

### Patch Changes

- 86ba939: Fix CLI binary compilation in CI by resolving pnpm workspace packages

## 0.1.0

### Minor Changes

- fc3f362: Add CLI binary compilation with Bun for cross-platform standalone executables. Release workflow now builds and uploads binaries (linux-x64, linux-arm64, darwin-arm64, darwin-x64, windows-x64) to GitHub Releases. Fix repository fields and bin configuration for npm publishing with provenance.

### Patch Changes

- Updated dependencies [fc3f362]
  - @no-witness-labs/hydra-sdk@0.0.4

## 0.0.5

### Patch Changes

- 7d8d43a: public hydra sdk cli

## 0.0.4

### Patch Changes

- 8496951: publish hydra sdk cli

## 0.0.3

### Patch Changes

- 1740fd6: Added HydraStateMachine
- Updated dependencies [1740fd6]
  - @no-witness-labs/hydra-sdk@0.0.3

## 0.0.2

### Patch Changes

- 9057eb8: new names for the packages
