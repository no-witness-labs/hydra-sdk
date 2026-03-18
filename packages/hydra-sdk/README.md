# @no-witness-labs/hydra-sdk

TypeScript SDK for the [Cardano Hydra Head](https://hydra.family/) protocol. Manage head lifecycle, subscribe to events, and build L2 transactions with a type-safe API.

## Installation

```bash
pnpm add @no-witness-labs/hydra-sdk
```

## Quick Start

```ts
import { Head } from "@no-witness-labs/hydra-sdk";

const head = await Head.create({ url: "ws://localhost:4001" });

head.subscribe((event) => {
  console.log(`[${event.tag}]`, event.payload);
});

await head.init();
await head.commit({});
await head.close();
await head.fanout();
await head.dispose();
```

## Features

- **Head lifecycle** — Init, Commit, Close, Contest, Fanout, Abort, SafeClose
- **L2 transactions** — NewTx, Decommit, Recover (incremental commits)
- **Event subscriptions** — Callback, async iterator, and Effect stream APIs
- **WebSocket transport** — Auto-reconnect with exponential backoff and heartbeat monitoring
- **HydraProvider** — Drop-in `Provider` for evolution-sdk transaction building on L2
- **Effect integration** — Every operation available as an `Effect` for composability
- **Cross-platform** — Works in Node.js and all major browsers (Chrome, Firefox, Safari)

## Documentation

Full documentation at [no-witness-labs.github.io/hydra-sdk](https://no-witness-labs.github.io/hydra-sdk/).

## License

MIT
