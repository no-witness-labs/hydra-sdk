# Hydra SDK — Product Requirements Document

**Version:** 1.0
**Date:** February 16, 2026
**Author:** No Witness Labs
**Status:** Draft

---

## 1. Executive Summary

### Problem Statement

Developers building on Cardano's Hydra Layer 2 must interact directly with a low-level WebSocket/HTTP JSON API exposed by the `hydra-node`. There is no production-grade TypeScript SDK that abstracts the Hydra Head protocol lifecycle, handles connection resilience, provides type-safe message schemas, or integrates with existing Cardano tooling (evolution-sdk, CIP-30 wallets). This forces every team to reimplement the same boilerplate: WebSocket management, message parsing, state machine tracking, and error handling.

### Proposed Solution

A modular, type-safe TypeScript SDK (`@no-witness-labs/hydra-sdk`) that provides:

- A **Protocol module** with Effect Schema-validated types for all Hydra API messages
- A **Socket module** for resilient WebSocket communication with automatic reconnection
- A **Head module** implementing the Hydra Head state machine
- A **`createHead()` factory** as the primary public API for head lifecycle management
- A **`createClient()` factory** for L1/L2 transaction building
- A **Query module** for streaming UTxO, snapshot, and transaction data
- A **HydraProvider** adapter for evolution-sdk interoperability
- A **CLI package** for operators to manage Hydra heads from the terminal

The SDK follows the **Hybrid Effect API pattern** — all logic is implemented in Effect (single source of truth), exposed via an `effect` namespace for composability, and wrapped in Promise-based convenience functions for simplicity.

### Success Criteria

| KPI | Target |
|---|---|
| Full Hydra API message coverage | 100% of `ClientInput` (9 commands) + `ServerOutput` (32 events) typed and validated |
| Head lifecycle integration tests pass | Connect → Init → Commit → Open → NewTx → Close → Fanout |
| Resilience tests pass | Node drop/restart recovery, wallet reconnect |
| Cross-platform test matrix | Chromium, Firefox, WebKit × Linux, Mac, Windows |
| Example projects on testnet | Transfer, Mint/Burn, Simple State Update — all passing |
| npm publish with provenance | Automated via changesets + GitHub Actions |
| Documentation coverage | Getting Started, Providers, Testing, Limits, Production Checklist pages published |

---

## 2. User Experience & Functionality

### User Personas

| Persona | Description | Primary Need |
|---|---|---|
| **DApp Developer** | Building Cardano apps that use Hydra for fast L2 transactions | Simple API to open heads, submit transactions, query state |
| **Hydra Operator** | Running `hydra-node` infrastructure for their team or users | CLI tools and monitoring for head management |
| **SDK Integrator** | Already using evolution-sdk and wants to add L2 support | Drop-in provider that makes evolution-sdk work with Hydra |

### User Stories

#### Story 1: Connect and manage a Hydra Head

> As a **DApp developer**, I want to connect to a Hydra node and manage the head lifecycle so that I can open a head, commit funds, transact at L2 speed, and close the head to settle back on L1.

**Acceptance Criteria:**

- `createHead({ url: 'ws://localhost:4001' })` establishes a WebSocket connection and returns a typed head instance
- `head.init()`, `head.commit(utxos)`, `head.close()`, `head.fanout()`, `head.abort()` execute lifecycle commands
- `head.subscribe(callback)` streams real-time state changes (`HeadIsInitializing`, `HeadIsOpen`, `HeadIsClosed`, etc.)
- `head.getState()` returns the current `HeadStatus` synchronously
- Both Promise and Effect APIs are available (`head.init()` and `head.effect.init()`)
- Connection auto-reconnects with exponential backoff on disconnect

#### Story 2: Submit L2 transactions

> As a **DApp developer**, I want to build and submit transactions inside an open Hydra Head so that I get near-instant confirmation without L1 fees.

**Acceptance Criteria:**

- `createClient(head)` returns a client with `l1.*` and `l2.*` namespaces
- `client.l2.newTx(transaction)` submits a transaction to the head via `NewTx` WebSocket message
- `TxValid` / `TxInvalid` responses are surfaced with typed error information
- `SnapshotConfirmed` events confirm transaction finality
- L1 transactions use evolution-sdk's existing providers (Blockfrost, Kupmios, Koios, Maestro)

#### Story 3: Query head state and UTxOs

> As a **DApp developer**, I want to query the current UTxO set and snapshot state of an open head so that I can display balances and build transactions.

**Acceptance Criteria:**

- `getUTxO()` returns the confirmed UTxO set
- `getSnapshot()` returns the latest confirmed snapshot
- `subscribeUTxO()`, `subscribeSnapshots()`, `subscribeTransactions()` provide real-time streaming via Effect PubSub (Effect API) or `AsyncIterableIterator` (Promise API)
- UTxO filtering by address is supported

#### Story 4: Use evolution-sdk against Hydra L2

> As an **SDK integrator**, I want to use my existing evolution-sdk code against a Hydra head by simply swapping the provider.

**Acceptance Criteria:**

- `HydraProvider` implements evolution-sdk's `Provider` interface
- Swapping to `HydraProvider` allows existing evolution-sdk code to target L2 with no other changes
- `getProtocolParameters()`, `getUtxos()`, `submitTx()` are implemented
- Provider swap workflow is documented (L1 → L2 → L1)

#### Story 5: Manage heads from the CLI

> As a **Hydra operator**, I want to connect to a node, inspect head status, and trigger lifecycle operations from the command line.

**Acceptance Criteria:**

- `hydra connect ws://node:4001` connects to a node
- `hydra status` shows current head state, participants, UTxO summary
- `hydra init`, `hydra close`, `hydra fanout` trigger lifecycle commands
- `--json` flag outputs machine-readable JSON
- Config precedence: CLI flags > env vars (`HYDRA_*`) > config file > defaults

#### Story 6: Resilient production deployment

> As a **DApp developer**, I want the SDK to handle network failures gracefully so that my application recovers without manual intervention.

**Acceptance Criteria:**

- Temporary disconnects trigger automatic reconnect with exponential backoff + jitter
- State is consistent after reconnection (replays history via `?history=yes`)
- `hydra-node` restart triggers SDK reconnect and state recovery
- Configurable retry policies (max retries, backoff factor, timeout)
- Connection health metrics are available

### Non-Goals

- **Running a `hydra-node`** — the SDK is a client, not a node implementation
- **Cardano L1 provider implementation** — L1 providers come from evolution-sdk
- **Custodial key management** — Hydra keys remain on the client side
- **Multi-head management per node** — single head per `hydra-node` (Hydra protocol constraint)
- **Protocol-level changes** — the SDK wraps the existing Hydra Head protocol as-is
- **Mobile-native SDKs** — TypeScript/JavaScript only (works in React Native via JS engine)

---

## 3. Technical Specifications

### Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    @no-witness-labs/cli              │
│              (@effect/cli, operator tooling)         │
└──────────────────────┬──────────────────────────────┘
                       │ uses
┌──────────────────────▼──────────────────────────────┐
│                 @no-witness-labs/core                │
│                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ createHead() │  │ createClient()│  │   Query    │ │
│  │  (public)    │  │  (public)     │  │  (public)  │ │
│  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘ │
│         │                 │                │        │
│  ┌──────▼───────┐  ┌──────▼───────┐       │        │
│  │ Head (state   │  │ HydraProvider│       │        │
│  │  machine)     │  │ (evolution-  │       │        │
│  │  (internal)   │  │  sdk adapter)│       │        │
│  └──────┬───────┘  └──────────────┘       │        │
│         │                                  │        │
│  ┌──────▼──────────────────────────────────▼──────┐ │
│  │              Socket (WebSocket layer)          │ │
│  │       (connect, send, receive, reconnect)      │ │
│  └──────────────────────┬─────────────────────────┘ │
│                         │                           │
│  ┌──────────────────────▼─────────────────────────┐ │
│  │          Protocol (types + schemas)            │ │
│  │  (ClientInput, ServerOutput, Effect Schema)    │ │
│  └────────────────────────────────────────────────┘ │
└──────────────────────┬──────────────────────────────┘
                       │ WebSocket + HTTP
              ┌────────▼────────┐
              │   hydra-node    │
              │  (WS :4001)     │
              │  (HTTP :4001)   │
              └────────┬────────┘
                       │
              ┌────────▼────────┐
              │  cardano-node   │
              │  (Layer 1)      │
              └─────────────────┘
```

### Module Breakdown

#### Protocol Module (`packages/core/src/Protocol/`)

**Purpose:** Type definitions and Effect Schema validators for all Hydra API messages.

**Coverage (from Hydra API v0.22.0):**

| Category | Messages |
|---|---|
| **ClientInput (commands)** | `Init`, `Abort`, `NewTx`, `Recover`, `Decommit`, `Close`, `SafeClose`, `Contest`, `Fanout`, `SideLoadSnapshot` |
| **ServerOutput (events)** | `Greetings`, `HeadIsInitializing`, `Committed`, `HeadIsOpen`, `HeadIsClosed`, `HeadIsContested`, `ReadyToFanout`, `HeadIsAborted`, `HeadIsFinalized`, `TxValid`, `TxInvalid`, `SnapshotConfirmed`, `SnapshotSideLoaded`, `DecommitRequested`, `DecommitApproved`, `DecommitFinalized`, `DecommitInvalid`, `CommitRecorded`, `CommitApproved`, `CommitFinalized`, `CommitRecovered`, `DepositActivated`, `DepositExpired`, `EventLogRotated`, `NetworkConnected`, `NetworkDisconnected`, `NetworkVersionMismatch`, `NetworkClusterIDMismatch`, `PeerConnected`, `PeerDisconnected`, `IgnoredHeadInitializing` |
| **ClientMessage (errors)** | `CommandFailed`, `PostTxOnChainFailed`, `RejectedInput`, `InvalidInput`, `SideLoadSnapshotRejected` |
| **Domain types** | `HeadId`, `HeadSeed`, `Party`, `Snapshot`, `SnapshotNumber`, `UTxO`, `TxIn`, `TxOut`, `Transaction`, `Value`, `Address`, `HeadStatus`, `HeadState`, `ContestationPeriod`, `ProtocolParameters` |

**Remaining tasks (Issue #30):**

- Make some response fields optional
- Verify `Schema.DateTimeUtcFromDate` correctness
- Proper Schema for response UTxOs
- Verify integer types in Schemas
- Comprehensive negative tests

#### Socket Module (`packages/core/src/Socket/`)

**Purpose:** WebSocket connection management with resilience.

**Capabilities:**

- Connect to `hydra-node` WebSocket (`ws://` or `wss://`)
- Send typed `ClientInput` messages
- Receive and decode typed `ServerOutput` / `ClientMessage` messages
- Automatic reconnection with exponential backoff + jitter
- Query parameter configuration: `?history=yes|no`, `?snapshot-utxo=yes|no`, `?address=<bech32>`
- Browser (native `WebSocket`) and Node.js (`ws` or `undici`) compatibility
- Connection state tracking and health monitoring

**Hybrid API pattern:**

```typescript
// Effect API (source of truth)
export const effect = {
  connect: (config: SocketConfig) => Effect.Effect<Socket, SocketError>,
  send: (socket: Socket, msg: ClientInput) => Effect.Effect<void, SocketError>,
  receive: (socket: Socket) => Stream.Stream<ServerOutput, SocketError>,
}

// Promise API (convenience)
export async function connect(config: SocketConfig): Promise<Socket> { ... }
export async function send(socket: Socket, msg: ClientInput): Promise<void> { ... }
```

#### Head Module (`packages/core/src/Head/` — internal)

**Purpose:** State machine tracking Hydra Head lifecycle transitions.

**States:** `Idle` → `Initializing` → `Open` → `Closed` → `FanoutPossible` → `Final`

**Also handles:** `Idle` → `Initializing` → `Aborted` (abort path)

**Transitions driven by:** `ServerOutput` events from the WebSocket

#### `createHead()` Factory (`packages/core/src/createHead/` — public API)

**Purpose:** Primary entry point for head lifecycle management.

```typescript
// Promise API
const head = await createHead({ url: 'ws://localhost:4001' })
head.subscribe((event) => console.log(event))
await head.init({ contestationPeriod: 60 })
await head.commit(utxos)
// ... head is open, transact ...
await head.close()
await head.fanout()
await head.dispose() // cleanup

// Effect API
const program = Effect.gen(function* () {
  const head = yield* createHead.effect({ url: 'ws://localhost:4001' })
  yield* head.effect.init({ contestationPeriod: 60 })
  yield* head.effect.commit(utxos)
  // ...
})
```

**Resource management:** `createHead()` acquires a WebSocket connection. Cleanup via:

- `head.dispose()` — manual close (long-lived)
- `withHead(config, body)` — bracket pattern (scoped usage)
- `createHead.effect.scoped(config)` — Effect Scope (Effect composition)

#### `createClient()` Factory (`packages/core/src/createClient/` — public API)

**Purpose:** Transaction building for L1 and L2.

```typescript
const client = createClient(head, { l1Provider: blockfrost })
// L2 — via head WebSocket
await client.l2.newTx(signedTx)
const utxo = await client.l2.getUTxO()

// L1 — via evolution-sdk provider
await client.l1.submitTx(signedTx)
```

#### Query Module (`packages/core/src/Query/` — public API)

**Purpose:** Read-only queries and streaming subscriptions.

| Function | Source | Description |
|---|---|---|
| `getUTxO()` | `GET /snapshot/utxo` | Current confirmed UTxO set |
| `getSnapshot()` | `GET /snapshot` | Latest confirmed snapshot |
| `getHeadState()` | `GET /head` | Current head state detail |
| `getProtocolParameters()` | `GET /protocol-parameters` | Cardano protocol params |
| `getPendingDeposits()` | `GET /commits` | Pending deposit tx IDs |
| `getSeenSnapshot()` | `GET /snapshot/last-seen` | Latest seen (unconfirmed) snapshot |
| `subscribeUTxO()` | WebSocket `SnapshotConfirmed` | Stream UTxO changes |
| `subscribeSnapshots()` | WebSocket `SnapshotConfirmed` | Stream confirmed snapshots |
| `subscribeTransactions()` | WebSocket `TxValid` | Stream transaction confirmations |

**Streaming in Promise API:** `AsyncIterableIterator<T>`
**Streaming in Effect API:** `Stream.Stream<T, E>`

#### HydraProvider (`packages/core/src/HydraProvider/`)

**Purpose:** evolution-sdk `Provider` adapter targeting Hydra L2.

Maps evolution-sdk Provider interface methods to Hydra APIs:

| Provider Method | Hydra Implementation |
|---|---|
| `getProtocolParameters()` | `GET /protocol-parameters` |
| `getUtxos(address)` | `GET /snapshot/utxo` (filtered by address) |
| `submitTx(tx)` | WebSocket `NewTx` or `POST /transaction` |

#### CLI Package (`packages/cli/`)

**Purpose:** Operator CLI using `@effect/cli`.

| Command | Description |
|---|---|
| `hydra connect <url>` | Connect to a hydra-node |
| `hydra status` | Show head state, participants, UTxO summary |
| `hydra init` | Initialize a new head |
| `hydra commit <utxo-file>` | Commit UTxOs to initializing head |
| `hydra close` | Close the head |
| `hydra fanout` | Fan out after contestation |
| `hydra abort` | Abort before all commits |
| `hydra config` | Show/set configuration |

Config precedence: CLI flags > `HYDRA_*` env vars > `~/.config/hydra-sdk/config.json` > defaults

### Hydra Node API Mapping

The SDK wraps both WebSocket and HTTP interfaces of the `hydra-node` (API v0.22.0):

**WebSocket (`ws://{host}:{port}/`):**

| Direction | Operation | SDK Method |
|---|---|---|
| PUB (send) | `Init` | `head.init()` |
| PUB | `Abort` | `head.abort()` |
| PUB | `NewTx` | `client.l2.newTx()` |
| PUB | `Recover` | `head.recover(txId)` |
| PUB | `Decommit` | `head.decommit(tx)` |
| PUB | `Close` | `head.close()` |
| PUB | `Contest` | `head.contest()` |
| PUB | `Fanout` | `head.fanout()` |
| PUB | `SideLoadSnapshot` | `head.sideLoadSnapshot(snapshot)` |
| SUB (receive) | `Greetings` | Connection metadata |
| SUB | `HeadIsInitializing` | State transition event |
| SUB | `Committed` | State transition event |
| SUB | `HeadIsOpen` | State transition event |
| SUB | `HeadIsClosed` | State transition event |
| SUB | `HeadIsContested` | State transition event |
| SUB | `ReadyToFanout` | State transition event |
| SUB | `HeadIsAborted` | State transition event |
| SUB | `HeadIsFinalized` | State transition event |
| SUB | `TxValid` / `TxInvalid` | Transaction result |
| SUB | `SnapshotConfirmed` | Snapshot finality |
| SUB | `Decommit*` events | Decommit lifecycle |
| SUB | `Commit*` events | Incremental commit lifecycle |
| SUB | `Network*` / `Peer*` | Network health |
| SUB | `CommandFailed` / `RejectedInput` | Error handling |

**HTTP (`http://{host}:{port}/`):**

| Method | Path | SDK Method |
|---|---|---|
| `GET` | `/head` | `query.getHeadState()` |
| `GET` | `/snapshot` | `query.getSnapshot()` |
| `GET` | `/snapshot/utxo` | `query.getUTxO()` |
| `GET` | `/snapshot/last-seen` | `query.getSeenSnapshot()` |
| `GET` | `/protocol-parameters` | `query.getProtocolParameters()` |
| `GET` | `/commits` | `query.getPendingDeposits()` |
| `POST` | `/commit` | `head.commit(utxo)` (draft commit tx) |
| `POST` | `/decommit` | `head.decommit(tx)` |
| `POST` | `/transaction` | `client.l2.newTx(tx)` |
| `POST` | `/cardano-transaction` | `client.l1.submitTx(tx)` |
| `POST` | `/snapshot` | `head.sideLoadSnapshot(req)` |
| `DELETE` | `/commits/{tx-id}` | `head.recover(txId)` |

### Integration Points

| System | Integration | Method |
|---|---|---|
| `hydra-node` | WebSocket + HTTP API | Primary interface |
| evolution-sdk | `HydraProvider` + L1 providers | Transaction building |
| CIP-30 wallets | Via evolution-sdk wallet module | Transaction signing (Nami, Eternl, Lace, etc.) |
| Cardano L1 | Via evolution-sdk providers | Blockfrost, Kupmios, Koios, Maestro |

### Security & Privacy

- **No custodial keys:** Hydra signing keys remain client-side. The SDK never stores or transmits private keys
- **TLS support:** `wss://` and `https://` for encrypted node communication (configured via `hydra-node` `--tls-cert` / `--tls-key`)
- **API unauthenticated:** The `hydra-node` API has no built-in auth. Users must secure access via network-level controls (firewall, VPN, reverse proxy). The SDK documents this clearly
- **Input validation:** All received messages validated against Effect Schema before processing — prevents malformed data from corrupting state
- **No telemetry:** SDK collects zero usage data

### Error Handling (Hybrid API Pattern)

All errors extend `Data.TaggedError` from Effect:

```typescript
// Error definitions
export class SocketError extends Data.TaggedError('SocketError')<{
  readonly cause: unknown
  readonly message: string
}> {}

export class HeadError extends Data.TaggedError('HeadError')<{
  readonly cause: unknown
  readonly message: string
}> {}

export class ProtocolError extends Data.TaggedError('ProtocolError')<{
  readonly cause: unknown
  readonly message: string
}> {}

// Effect API — errors in type signature
function initEffect(): Effect.Effect<void, HeadError | SocketError> { ... }

// Promise API — errors thrown, documented with @throws
/** @throws {HeadError} When head is in wrong state
  * @throws {SocketError} When connection fails */
export async function init(): Promise<void> { ... }
```

---

## 4. Technology Stack & Constraints

| Component | Technology | Rationale |
|---|---|---|
| Language | TypeScript 5.9+ (strict mode) | Type safety, ecosystem |
| Runtime | ES2022, ESM-only | Modern targets, no CJS legacy |
| Effect library | Effect | Composition, error handling, DI (per Hybrid API pattern) |
| Schema validation | `@effect/schema` | Runtime type validation for protocol messages |
| WebSocket | Native `WebSocket` (browser) / `ws` (Node.js) | Cross-platform |
| Cardano tooling | evolution-sdk | L1 providers, wallet integration, tx building |
| CLI framework | `@effect/cli` | Declarative CLI with Effect integration |
| Monorepo | pnpm workspaces + Turborepo | Fast builds, caching |
| Testing | Vitest + Playwright | Unit + cross-browser testing |
| Documentation | Fumadocs | MDX docs with Twoslash code examples |
| Versioning | Changesets | Automated releases |
| CI/CD | GitHub Actions | Build, test, publish pipeline |

### Platform Requirements

| Platform | Requirement |
|---|---|
| Node.js | >= 20 |
| Browsers | Chromium (latest-1), Firefox (latest-1), WebKit (latest-1) |
| OS | Linux, macOS, Windows |

---

## 5. Risks & Roadmap

### Phased Rollout

#### Milestone 1 — Foundation (Completed/In Progress)

**Goal:** Core infrastructure, protocol types, WebSocket layer, head state machine.

| Deliverable | Status | Issue |
|---|---|---|
| Package structure & build config | Done | #2 |
| Protocol module — message types & schemas | Done (refinements in #30) | #3 |
| Socket module — WebSocket communication | Done | #4 |
| Head state machine (internal) | Done | #5 |
| `createHead()` factory function | In Progress | #6 |
| Documentation site setup | Open | #7 |

#### Milestone 2 — Transaction & Query Layer

**Goal:** L1/L2 transaction API, query module, examples, integration tests.

| Deliverable | Issue |
|---|---|
| Query module — head state & UTxO queries with streaming | #8 |
| `createClient()` factory — L1/L2 transaction API | #9 |
| Example projects (transfer, mint/burn, state update) | #10 |
| CLI package setup with @effect/cli | #11 |
| Complete head lifecycle integration tests | #12 |

#### Milestone 3 — Integration & Resilience

**Goal:** evolution-sdk integration, cross-platform testing, production resilience.

| Deliverable | Issue |
|---|---|
| Provider integration documentation | #13 |
| Cross-browser & cross-platform testing suite | #14 |
| HydraProvider — evolution-sdk provider implementation | #15 |
| Connection resilience & recovery | #16 |

#### Milestone 4 — Release & Documentation

**Goal:** npm publish, complete docs, grant closeout.

| Deliverable | Issue |
|---|---|
| npm release automation | #17 |
| Complete documentation | #18 |
| Grant closeout report | #19 |

#### Future — hydra-manager-sdk

| Deliverable | Issue |
|---|---|
| hydra-manager-sdk (multi-head orchestration) | #23 |

### Technical Risks

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| **Hydra API breaking changes** | Protocol module requires updates | Medium | Pin to specific `hydra-node` version in tests; Schema validation catches mismatches early |
| **evolution-sdk Provider interface changes** | HydraProvider adapter breaks | Low | Depend on stable evolution-sdk version; integration tests in CI |
| **WebSocket reliability in browsers** | Dropped connections lose state | Medium | Exponential backoff + history replay on reconnect; offline queue for pending ops |
| **Hydra protocol limitations** | SDK cannot work around protocol constraints (single head per node, static topology, training wheels) | N/A | Document clearly in "Limits" guide; set user expectations |
| **Cross-browser WebSocket differences** | Safari/Firefox edge cases | Low | Playwright test matrix across Chromium/Firefox/WebKit |
| **Large UTxO sets** | Memory pressure in browser | Low | Pagination support; streaming instead of full materialization |

### Dependencies

| Dependency | Version | Purpose |
|---|---|---|
| `hydra-node` | >= 0.22.0 | Target node API version |
| `effect` | >= 3.x | Core runtime (peer dependency) |
| `@effect/schema` | >= 0.x | Runtime validation |
| `@effect/cli` | >= 0.x | CLI framework |
| evolution-sdk | TBD | L1 providers + wallet + tx building |

---

## 6. Testing Strategy

### Unit Tests (Vitest)

- Protocol schema validation (positive + negative cases)
- Head state machine transitions (all valid/invalid paths)
- Socket reconnection logic
- `createHead()` / `createClient()` with mocked WebSocket

### Integration Tests (Vitest + Docker)

- Full head lifecycle against dockerized `hydra-node`
- Multi-party head with multiple SDK instances
- Reconnection after node restart
- L1 ↔ L2 commit/fanout flows

### Cross-Browser Tests (Playwright)

- Chromium, Firefox, WebKit
- WebSocket connection + message exchange
- Wallet extension interaction (Nami, Eternl, Lace)

### Platform Tests (CI Matrix)

- Linux (Ubuntu latest), macOS (latest), Windows (latest)

### Testnet Validation

- Example projects run on Cardano `preview` testnet
- Transfer, Mint/Burn, State Update — all produce on-chain evidence

---

## Appendix: Hybrid API Pattern Summary

Per the project's architectural decision ([hybrid-effect-api.instructions.md](/.github/instructions/hybrid-effect-api.instructions.md)):

| Rule | Key Point |
|---|---|
| 1. Implementation in Effect | Single source of truth. Exception for pure hot-path functions |
| 2. `effect` namespace | Direct access: `Module.effect.operation()` |
| 3. Promise runs the Effect | Sync → `runEffect()`, Async → `runEffectPromise()` |
| 4. Same world | Effect→Effect, Promise→Promise. Never mix |
| 5. Error handling | Effect: typed values. Promise: `@throws` + `Data.TaggedError` |
| 6. Resource management | Bracket > close() > asyncDispose > Scope |
| 7. Dependencies internal | Never leak Effect services to Promise API |
