# @no-witness-labs/hydra-devnet

Local Docker-based Cardano + Hydra development environment. Spin up a full cluster for testing and integration with a single function call.

## Installation

```bash
pnpm add -D @no-witness-labs/hydra-devnet
```

Requires Docker to be running.

## Quick Start

```ts
import { Cluster } from "@no-witness-labs/hydra-devnet";

await Cluster.withCluster(async (cluster) => {
  console.log(`Hydra API: ${cluster.hydraApiUrl}`);
  // Use cluster.hydraApiUrl with @no-witness-labs/hydra-sdk
});
// Cluster is automatically stopped and cleaned up on exit
```

## What It Does

- Starts a **Cardano node** with a private devnet (instant block production)
- Starts a **Hydra node** connected to the Cardano node
- Generates keys, genesis config, and protocol parameters
- Provides WebSocket and HTTP URLs for SDK connection
- Cleans up all Docker containers on exit

## Configuration

```ts
const cluster = Cluster.make({
  clusterName: "my-devnet",
  cardanoNode: {
    image: "ghcr.io/intersectmbo/cardano-node:10.5.3",
    port: 3001,
    networkMagic: 42,
  },
  hydraNode: {
    image: "ghcr.io/cardano-scaling/hydra-node:1.2.0",
    apiPort: 4001,
    contestationPeriod: 60,
  },
});
```

## License

MIT
