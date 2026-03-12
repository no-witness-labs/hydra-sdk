---
title: Provider/HydraProvider.ts
nav_order: 3
parent: Modules
---

## HydraProvider overview

This module provides `HydraProvider`, an `@evolution-sdk/evolution` `Provider`
implementation that targets a Hydra L2 head instead of a Cardano L1 node.
Use it with the same transaction-building API as other evolution providers.

---

<h2 class="text-delta">Table of contents</h2>

- [Models](#models)
  - [HydraProvider (class)](#hydraprovider-class)
    - [Effect (property)](#effect-property)
    - [getSnapshotUtxos (property)](#getsnapshotutxos-property)
    - [getProtocolParameters (property)](#getprotocolparameters-property)
    - [getUtxos (property)](#getutxos-property)
    - [getUtxosWithUnit (property)](#getutxoswithunit-property)
    - [getUtxoByUnit (property)](#getutxobyunit-property)
    - [getUtxosByOutRef (property)](#getutxosbyoutref-property)
    - [getDelegation (property)](#getdelegation-property)
    - [getDatum (property)](#getdatum-property)
    - [awaitTx (property)](#awaittx-property)
    - [submitTx (property)](#submittx-property)
    - [evaluateTx (property)](#evaluatetx-property)
  - [HydraProviderConfig (interface)](#hydraproviderconfig-interface)

---

# Models

## HydraProvider (class)

`HydraProvider` is a Cardano `Provider` implementation that targets a Hydra
L2 head instead of a traditional L1 node.

It exposes the same high-level query and transaction APIs as other
`@evolution-sdk/evolution` providers, but:

- **Reads** (UTxOs, datums, protocol parameters) are served from the
  hydra-node HTTP API snapshot.
- **Writes** (submitting transactions, awaiting confirmation) are routed
  through a connected `HydraHead` WebSocket instance.

**Signature**

```ts
export declare class HydraProvider {
  constructor(config: HydraProviderConfig);
}
```

**Example**

```ts
// Promise API — full lifecycle
import { Address } from "@evolution-sdk/evolution";
import { Head, Provider } from "@no-witness-labs/hydra-sdk";

async function example() {
  const head = await Head.create({ url: "ws://localhost:4001" });

  await head.init();

  const provider = new Provider.HydraProvider({
    head,
    httpUrl: "http://localhost:4001",
  });

  const address = Address.fromBech32("addr_test1...");
  const utxos = await provider.getUtxos(address);
  const txHash = await provider.submitTx(signedTx);
  await provider.awaitTx(txHash);

  await head.dispose();
}
```

**Example**

```ts
// Effect API — full lifecycle
import { Address } from "@evolution-sdk/evolution";
import { Effect } from "effect";
import { Head, Provider } from "@no-witness-labs/hydra-sdk";

const program = Effect.gen(function* () {
  const head = yield* Head.effect.create({ url: "ws://localhost:4001" });

  yield* head.effect.init();

  const provider = new Provider.HydraProvider({
    head,
    httpUrl: "http://localhost:4001",
  });

  const address = Address.fromBech32("addr_test1...");
  const utxos = yield* provider.Effect.getUtxos(address);
  const txHash = yield* provider.Effect.submitTx(signedTx);
  yield* provider.Effect.awaitTx(txHash);

  yield* head.effect.dispose();
});

await Effect.runPromise(program);
```

### Effect (property)

**Signature**

```ts
readonly Effect: ProviderEffect
```

### getSnapshotUtxos (property)

Return every UTxO in the current L2 snapshot without address filtering.

**Signature**

```ts
getSnapshotUtxos: () => Promise<Array<UTxO.UTxO>>;
```

**Example**

```ts
// Promise API
const allSnapshotUtxos = await provider.getSnapshotUtxos();
console.log(allSnapshotUtxos.length);
```

**Example**

```ts
// Effect API
const allUtxos = yield * Effect.promise(() => provider.getSnapshotUtxos());
```

### getProtocolParameters (property)

Fetches protocol parameters from the hydra-node (fees, sizes, cost models).

**Signature**

```ts
getProtocolParameters: () => Promise<ProtocolParameters>;
```

**Example**

```ts
// Promise API
const pp = await provider.getProtocolParameters();
```

**Example**

```ts
// Effect API
const pp = yield * provider.Effect.getProtocolParameters();
```

### getUtxos (property)

Returns UTxOs at the given address or payment credential from the L2 snapshot.

**Signature**

```ts
getUtxos: (addressOrCredential: Parameters<Provider["getUtxos"]>[0]) =>
  Promise<UTxO.UTxO[]>;
```

**Example**

```ts
// Promise API
const utxos = await provider.getUtxos(address);
```

**Example**

```ts
// Effect API
const utxos = yield * provider.Effect.getUtxos(address);
```

### getUtxosWithUnit (property)

Returns UTxOs at the given address or credential that contain the given asset unit.

**Signature**

```ts
getUtxosWithUnit: (
  addressOrCredential: Parameters<Provider["getUtxosWithUnit"]>[0],
  unit: Parameters<Provider["getUtxosWithUnit"]>[1],
) => Promise<UTxO.UTxO[]>;
```

**Example**

```ts
// Promise API
const utxos = await provider.getUtxosWithUnit(address, unit);
```

**Example**

```ts
// Effect API
const utxos = yield * provider.Effect.getUtxosWithUnit(address, unit);
```

### getUtxoByUnit (property)

Returns the single UTxO that holds the given asset unit (fails if none or multiple).

**Signature**

```ts
getUtxoByUnit: (unit: Parameters<Provider["getUtxoByUnit"]>[0]) =>
  Promise<UTxO.UTxO>;
```

**Example**

```ts
// Promise API
const utxo = await provider.getUtxoByUnit(unit);
```

**Example**

```ts
// Effect API
const utxo = yield * provider.Effect.getUtxoByUnit(unit);
```

### getUtxosByOutRef (property)

Returns UTxOs corresponding to the given transaction inputs (out refs).

**Signature**

```ts
getUtxosByOutRef: (outRefs: Parameters<Provider["getUtxosByOutRef"]>[0]) =>
  Promise<UTxO.UTxO[]>;
```

**Example**

```ts
// Promise API
const utxos = await provider.getUtxosByOutRef(inputs);
```

**Example**

```ts
// Effect API
const utxos = yield * provider.Effect.getUtxosByOutRef(inputs);
```

### getDelegation (property)

Delegation is not supported on Hydra L2. Returns a stub `{ poolId: null, rewards: 0n }`.

**Signature**

```ts
getDelegation: (rewardAddress: Parameters<Provider["getDelegation"]>[0]) =>
  Promise<Delegation>;
```

**Example**

```ts
// Promise API
const delegation = await provider.getDelegation(rewardAddress);
```

**Example**

```ts
// Effect API
const delegation = yield * provider.Effect.getDelegation(rewardAddress);
```

### getDatum (property)

Looks up datum by hash from inline datums in the current L2 snapshot.

**Signature**

```ts
getDatum: (datumHash: Parameters<Provider["getDatum"]>[0]) =>
  Promise<Data.Data>;
```

**Example**

```ts
// Promise API
const data = await provider.getDatum(datumHash);
```

**Example**

```ts
// Effect API
const data = yield * provider.Effect.getDatum(datumHash);
```

### awaitTx (property)

Waits until the transaction is either validated (TxValid) or invalidated (TxInvalid) on the head.

**Signature**

```ts
awaitTx: (
  txHash: Parameters<Provider["awaitTx"]>[0],
  checkInterval?: Parameters<Provider["awaitTx"]>[1],
) => Promise<boolean>;
```

**Example**

```ts
// Promise API
await provider.awaitTx(txHash);
```

**Example**

```ts
// Effect API
yield * provider.Effect.awaitTx(txHash);
```

### submitTx (property)

Submits a signed transaction to the open Hydra Head via WebSocket (NewTx).

**Signature**

```ts
submitTx: (tx: Parameters<Provider["submitTx"]>[0]) =>
  Promise<TransactionHash.TransactionHash>;
```

**Example**

```ts
// Promise API
const txHash = await provider.submitTx(signedTx);
```

**Example**

```ts
// Effect API
const txHash = yield * provider.Effect.submitTx(signedTx);
```

### evaluateTx (property)

Not supported on Hydra L2. Always rejects with `ProviderError`.
Hydra heads do not expose Plutus script evaluation via the provider API.

**Signature**

```ts
evaluateTx: (
  tx: Parameters<Provider["evaluateTx"]>[0],
  additionalUTxOs?: Parameters<Provider["evaluateTx"]>[1],
) => Promise<EvalRedeemer[]>;
```

**Example**

```ts
// Promise API
await provider.evaluateTx(tx); // throws ProviderError
```

**Example**

```ts
// Effect API
yield * provider.Effect.evaluateTx(tx); // fails with ProviderError
```

## HydraProviderConfig (interface)

Configuration for constructing a `HydraProvider`.

At minimum you must supply a connected `HydraHead` instance and the
HTTP base URL of the corresponding hydra-node.

**Signature**

```ts
export interface HydraProviderConfig {
  /** A connected `HydraHead` instance (for submitting transactions via WS). */
  readonly head: HydraHead;
  /**
   * HTTP base URL of the hydra-node API (e.g. `"http://localhost:4001"`).
   *
   * This is required because `HydraHead` does not expose its WebSocket URL.
   * Typically this is the same host/port as the WebSocket URL with `http://`
   * instead of `ws://`.
   */
  readonly httpUrl: string;
}
```

**Example**

```ts
// Promise API
import { Head, Provider } from "@no-witness-labs/hydra-sdk";

async function example() {
  const head = await Head.create({ url: "ws://localhost:4001" });
  const provider = new Provider.HydraProvider({
    head,
    httpUrl: "http://localhost:4001",
  });
}
```

**Example**

```ts
// Effect API
import { Effect } from "effect";
import { Head, Provider } from "@no-witness-labs/hydra-sdk";

Effect.gen(function* () {
  const head = yield* Head.effect.create({ url: "ws://localhost:4001" });
  const provider = new Provider.HydraProvider({
    head,
    httpUrl: "http://localhost:4001",
  });
});
```
