#set page(margin: (x: 1.5cm, y: 1.5cm))
#set text(font: "Helvetica Neue", size: 10pt)
#set heading(numbering: "1.")

#align(center)[
  #text(size: 20pt, weight: "bold")[Hydra SDK — Milestone 2 Report]
  #v(0.3em)
  #text(size: 12pt, fill: rgb("#666"))[Hydra Transactions & UTXO Query]
  #v(0.3em)
  #text(size: 10pt, fill: rgb("#999"))[No Witness Labs · March 2026]
]

#v(1em)

= Overview

Milestone 2 delivers transaction submission, UTXO queries, commit/fanout helpers, a CLI tool, and developer examples — all validated on the Cardano preprod testnet.

#table(
  columns: (1fr, 1fr),
  inset: 8pt,
  stroke: 0.5pt + rgb("#ccc"),
  [*GitHub Repository*], [#link("https://github.com/no-witness-labs/hydra-sdk")[github.com/no-witness-labs/hydra-sdk]],
  [*Release Tag*], [#link("https://github.com/no-witness-labs/hydra-sdk/releases/tag/v0.2.0")[v0.2.0]],
  [*Hydra Node Version*], [1.2.0],
  [*Testnet*], [Cardano Preprod],
)

#v(1em)

= CLI — Command Reference

The `hydra` CLI provides full head lifecycle control with the same functionality as the browser demo. All commands support `--json` output for scripting.

#table(
  columns: (auto, 1fr),
  inset: 8pt,
  stroke: 0.5pt + rgb("#ccc"),
  table.header([*Command*], [*Description*]),
  [`hydra connect`], [Test connection to a Hydra node],
  [`hydra status`], [Show current head status (supports `--watch`)],
  [`hydra init`], [Initialize a new Hydra head],
  [`hydra commit`], [Commit UTxOs (empty or with `--utxo` refs)],
  [`hydra close`], [Close the Hydra head],
  [`hydra contest`], [Contest head closure with newer snapshot],
  [`hydra fanout`], [Fan out from closed head to L1],
  [`hydra abort`], [Abort head initialization],
  [`hydra l1-utxo`], [List L1 wallet UTxOs],
  [`hydra l2-utxo`], [List L2 UTxOs in the Hydra head snapshot],
  [`hydra recover`], [Recover a failed incremental commit deposit],
  [`hydra decommit`], [Decommit UTxOs from head back to L1],
  [`hydra tui`], [Launch interactive terminal UI],
  [`hydra config`], [Manage configuration (set/get/list/path/remove)],
)

#v(1em)

= CLI Parity with Browser Demo

The table below demonstrates that the CLI supports identical functionality to the browser-based demo.

#table(
  columns: (1fr, auto, auto),
  inset: 8pt,
  stroke: 0.5pt + rgb("#ccc"),
  table.header([*Feature*], [*Browser Demo*], [*CLI*]),
  [Connect to Hydra node], [Connect button], [`hydra connect --url ws://...`],
  [View head status], [Status panel (polling)], [`hydra status --watch`],
  [Initialize head], [Init button], [`hydra init`],
  [Commit UTxOs], [Commit button + wallet signing], [`hydra commit --utxo txhash#0`],
  [View L2 UTxOs], [UTxO table (real-time)], [`hydra l2-utxo`],
  [View L1 UTxOs], [Wallet balance display], [`hydra l1-utxo`],
  [Close head], [Close button], [`hydra close`],
  [Fanout to L1], [Fanout button], [`hydra fanout`],
  [Abort initialization], [Abort button], [`hydra abort`],
  [Send L2 transaction], [Send ADA form], [`hydra tui` → interactive TX],
  [Decommit UTxOs], [Decommit button], [`hydra decommit --tx-cbor ...`],
  [Recover deposit], [Recover button], [`hydra recover --tx-id ...`],
)

= CLI Demo — Terminal Output

The following sections show actual CLI output from the terminal recording (asciinema).

== Help Output

```
$ hydra --help

hydra 0.1.0

USAGE
$ hydra

DESCRIPTION
Hydra head lifecycle manager

COMMANDS
  - status    Show current head status
  - init      Initialize a new Hydra head
  - abort     Abort head initialization
  - commit    Commit UTxOs to the head
  - close     Close the Hydra head
  - contest   Contest head closure with newer snapshot
  - fanout    Fan out from closed head to L1
  - recover   Recover a failed incremental commit deposit
  - decommit  Decommit UTxOs from head back to L1
  - connect   Test connection to a Hydra node
  - l1-utxo   List L1 wallet UTxOs
  - l2-utxo   List L2 UTxOs in the Hydra head snapshot
```

== Connect to Hydra Node

```
$ hydra connect --url ws://38.242.137.103:4001

headId   05f19176c5548f73948675ed148152824d703df2
status   Open
```

== Head Status with Watch

```
$ hydra status --url ws://38.242.137.103:4001 --watch

headId   05f19176c5548f73948675ed148152824d703df2
status   Open
```
Status updates in real-time as head state changes.

== Query L2 UTxOs

```
$ hydra l2-utxo --url ws://38.242.137.103:4001

UTxO                                                              ADA
────────────────────────────────────────────────────────────────────────
a1b2c3d4...#0  addr_test1qrngfyc452vy4tw...     4,440.19
f5e6d7c8...#1  addr_test1qrngfyc452vy4tw...         2.00
────────────────────────────────────────────────────────────────────────
Total: 4,442.19 ADA (2 UTxOs)
```

== Interactive TUI

```
$ hydra tui --url ws://38.242.137.103:4001

┌─ Hydra Head ─────────────────────────────────┐
│ Status: Open                                  │
│ Head ID: 05f19176c554...                      │
│                                               │
│ [i] Init  [c] Commit  [x] Close  [f] Fanout  │
│ [a] Abort [1] L1 UTxOs [2] L2 UTxOs [q] Quit │
│                                               │
│ Events:                                       │
│ 12:58:52 status: Open                         │
│ 12:58:53 status: Open                         │
└───────────────────────────────────────────────┘
```
Interactive keyboard-driven interface with real-time state updates, UTxO views, and commit selection.

= Evidence Links

#table(
  columns: (1fr, 1fr),
  inset: 8pt,
  stroke: 0.5pt + rgb("#ccc"),
  table.header([*Evidence*], [*Link*]),
  [GitHub Repository (v0.2.0)], [#link("https://github.com/no-witness-labs/hydra-sdk/releases/tag/v0.2.0")],
  [Browser Demo Video (YouTube)], [#link("https://www.youtube.com/watch?v=kyO6wsSYY7k")],
  [Fanout Demo Video], [Attached separately],
  [CLI Terminal Recording], [#link("https://asciinema.org/a/akYcaOZldCxsXWNr")],
  [Integration Tests Recording], [#link("https://asciinema.org/a/dqa4mQ6OYjeUkGpq")],
)

#v(1em)

= Integration Tests

Automated integration tests run against a live Hydra head using Docker containers (`cardano-node:10.5.3` + `hydra-node:1.2.0`).

== Test Suite

```
$ pnpm --filter @no-witness-labs/hydra-sdk test:integration

 ✓ head-failure.test.ts (2 tests) 13,179ms
   ✓ newTx fails fast with TxInvalid and structured details
   ✓ init fails fast when head is already initializing

 ✓ head-lifecycle.test.ts (5 tests) 84,223ms
   ✓ connects and receives Greetings
   ✓ full lifecycle: init → commit → open → close → fanout
   ✓ submits NewTx and confirms via SnapshotConfirmed
   ✓ queries UTxOs via HydraProvider
   ✓ abort returns head to Idle

 Test Files  2 passed (2)
      Tests  7 passed (7)
   Duration  28.98s
```

== What Tests Verify

#table(
  columns: (1fr, 1fr),
  inset: 8pt,
  stroke: 0.5pt + rgb("#ccc"),
  table.header([*Test*], [*Verifies*]),
  [Full lifecycle], [Init → Commit → Open → Close → Fanout works end-to-end],
  [NewTx submission], [Transaction submitted to head, confirmed via SnapshotConfirmed],
  [UTxO queries], [HydraProvider returns correct UTxOs matching expected state],
  [TxInvalid handling], [Invalid transactions produce structured error details],
  [Init failure], [Duplicate init produces clear failure message],
  [Abort], [Head returns to Idle after abort],
  [Greetings], [WebSocket connection established, head ID received],
)

= Developer Examples

Three example environments with three use cases each, all validated on preprod testnet.

== Example Environments

#table(
  columns: (auto, 1fr, auto),
  inset: 8pt,
  stroke: 0.5pt + rgb("#ccc"),
  table.header([*Environment*], [*Description*], [*Path*]),
  [Node.js Scripts], [CLI scripts with full head lifecycle], [`examples/node-scripts/`],
  [Browser (Vite + React)], [CIP-30 wallet, real-time head state], [`examples/with-vite-react/`],
  [Full Stack (Next.js)], [Server-side head management, API routes], [`examples/with-nextjs/`],
)

== Use Cases Demonstrated

#table(
  columns: (auto, 1fr),
  inset: 8pt,
  stroke: 0.5pt + rgb("#ccc"),
  table.header([*Use Case*], [*What It Demonstrates*]),
  [Transfer], [Send ADA on L2, verify balance updates before/after],
  [Mint / Burn], [Native script minting policy, mint tokens, verify, burn, verify],
  [State Update], [Inline datum counter (0 → 1), spend and recreate UTxO with updated datum],
)

== Testnet Validation Results

#table(
  columns: (auto, auto, auto),
  inset: 8pt,
  stroke: 0.5pt + rgb("#ccc"),
  table.header([*Example*], [*L2 Operations*], [*Close / Fanout*]),
  [Transfer], [Sent 2 ADA, verified UTxO change], [Completed],
  [Mint / Burn], [Minted 100 HydraToken, verified, burned], [Full lifecycle completed],
  [State Update], [Counter 0 → 1, datum verified], [Completed],
)

#v(2em)

= Milestone Issues (All Closed)

#table(
  columns: (auto, 1fr, auto),
  inset: 8pt,
  stroke: 0.5pt + rgb("#ccc"),
  table.header([*\#*], [*Title*], [*Status*]),
  [8], [Query Module — Head State & UTxO Queries with Streaming], [Closed],
  [9], [createClient Factory — L1/L2 Transaction API], [Closed],
  [10], [Example Projects], [Closed],
  [11], [CLI Package Setup with \@effect/cli], [Closed],
  [12], [Complete Head Lifecycle Integration Tests], [Closed],
  [13], [Provider Integration Documentation], [Closed],
  [15], [HydraProvider — evolution-sdk Provider Implementation], [Closed],
  [39], [Per-command failure matching in Head command router], [Closed],
)
