---
"@no-witness-labs/hydra-sdk": minor
---

Add MeshJS provider adapter (HydraMeshProvider)

- New `HydraMeshProvider` class implementing `IFetcher`, `ISubmitter`, `IEvaluator`, and `IListener` from `@meshsdk/common`
- Bidirectional UTxO converters between hydra-node and MeshJS formats (`mesh-utxo.ts`)
- New `./mesh-provider` subpath export for tree-shakeable MeshJS integration
- `@meshsdk/common` added as optional peer dependency
- SDK now supports 2 provider adapters: evolution-sdk (`HydraProvider`) and MeshJS (`HydraMeshProvider`)
- Cross-browser test report artifacts published in CI
