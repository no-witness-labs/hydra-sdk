# Project Close-out Report — No Witness: Hydra Manager

|                            |                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------ |
| **Project Name**           | No Witness — Hydra Manager                                                           |
| **Project Number**         | 1400085                                                                              |
| **Fund / Challenge**       | Project Catalyst Fund 14 — Cardano Open: Developers                                  |
| **Proposal URL**           | https://projectcatalyst.io/funds/14/cardano-open-developers/no-witness-hydra-manager |
| **Project Manager**        | Jonathan Rodriguez                                                                   |
| **Date Project Started**   | December 2025                                                                        |
| **Date Project Completed** | July 2026                                                                            |
| **Budget**                 | 81,000 ADA (4 milestones: 20,000 / 24,000 / 20,000 / 17,000)                         |
| **Close-out Video**        | https://youtu.be/Th3_NDU4itQ                                                         |

> **Note on the package name:** the proposal referred to the deliverable as `hydra-manager`. That name was already occupied on the npm registry by an unrelated package (a monorepo tool, published years earlier by a different author), so the SDK ships under the organization scope as [`@no-witness-labs/hydra-sdk`](https://www.npmjs.com/package/@no-witness-labs/hydra-sdk). All other acceptance criteria are unchanged.

## Challenge KPIs and how the project addressed them

The Cardano Open: Developers challenge funds open-source developer tooling that lowers the barrier to building on Cardano.

| KPI                            | How it was addressed                                                                                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open-source developer tooling  | Browser-native TypeScript SDK for the Hydra Head protocol, MIT-licensed, published to npm (`@no-witness-labs/hydra-sdk`, `@no-witness-labs/hydra-sdk-cli`, `@no-witness-labs/hydra-devnet`) |
| Progressive versioned releases | v0.1.0 (Jan 2026) → v0.2.0 (Mar 2026) → v0.3.0 (Jun 2026) → v1.0.0 (Jul 2026), all published with npm provenance (signed build attestations)                                                |
| Quality assurance              | Cross-browser (Chromium/Firefox/WebKit) × cross-platform (Linux/macOS/Windows) CI matrix, integration tests against a real hydra-node, node-resilience tests                                |
| Documentation & education      | Docs site with getting-started, guides, API reference, "Build Your Own Hydra App" tutorial, FAQ, production checklist                                                                       |
| Real-world demonstration       | Hosted demo app performing full head lifecycle (init → commit → L2 tx → close → fanout) on Cardano preprod with CIP-30 wallets                                                              |

## Deliverables and evidence

| Deliverable                                       | Evidence                                                                                      |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| SDK v1.0.0 on npm                                 | https://www.npmjs.com/package/@no-witness-labs/hydra-sdk                                      |
| CLI (npm + standalone binaries for 5 platforms)   | https://www.npmjs.com/package/@no-witness-labs/hydra-sdk-cli                                  |
| GitHub repository (MIT license)                   | https://github.com/no-witness-labs/hydra-sdk                                                  |
| v1.0.0 GitHub release                             | https://github.com/no-witness-labs/hydra-sdk/releases/tag/v1.0.0                              |
| Documentation site                                | https://no-witness-labs.github.io/hydra-sdk/                                                  |
| Release Notes / versioned API                     | https://no-witness-labs.github.io/hydra-sdk/docs/release-notes                                |
| "Build Your Own Hydra App" tutorial               | https://no-witness-labs.github.io/hydra-sdk/docs/tutorial                                     |
| Hosted demo app (links to docs, end-to-end flows) | http://178.63.100.104/                                                                        |
| Cross-browser test reports                        | CI artifacts on https://github.com/no-witness-labs/hydra-sdk/actions (browser.yml)            |
| Example applications                              | `examples/with-vite-react`, `examples/with-nextjs`, `examples/node-scripts` in the repository |

**Open-source status:** all code is public under the MIT license. **Testing:** unit tests (Vitest), integration tests against hydra-node v1.2.0 on preprod, and a 3-browser × 3-OS Playwright matrix run in CI on every release.

## Usage

- **npm downloads (Dec 2025 – Jul 2026):** 316 (`hydra-sdk`) + 399 (`hydra-sdk-cli`) = 715+ installs during the funded period, before the v1.0.0 stability declaration.
- **Contributors:** 5 people contributed to the repository.
- **Demo interactions:** the hosted demo has been used to open, commit to, transact in, and fan out real Hydra heads on Cardano preprod (transaction evidence visible on preprod explorers via the demo's head address).
- **Social reach:** every release was announced on X automatically (GitHub Actions posts on publish) via [@nowitnesslabs](https://x.com/nowitnesslabs) and [@solidsnakedev](https://x.com/solidsnakedev) — see the [social plan spreadsheet](https://docs.google.com/spreadsheets/d/1c-uXL-_7sOoYJ-dj-Df6EOyUwtpxI7UN-lg1I9J2Vks/edit?usp=sharing). Across the tracked release posts (as of 2026-07-15): **959 impressions and 51 total interactions** (37 likes, 11 reposts, 1 reply, 2 bookmarks).

| Date       | Post                                                                                     | Impressions | Interactions |
| ---------- | ---------------------------------------------------------------------------------------- | ----------- | ------------ |
| 2026-03-18 | [hydra-sdk 0.0.4](https://x.com/solidsnakedev/status/2034196264259059883)                | 153         | 8            |
| 2026-03-18 | [hydra-sdk-cli 0.1.1](https://x.com/solidsnakedev/status/2034203293166252061)            | 256         | 16           |
| 2026-03-18 | [hydra-sdk-cli 0.1.1 (binaries)](https://x.com/solidsnakedev/status/2034203903605002596) | 180         | 10           |
| 2026-07-14 | [hydra-sdk-cli 1.0.0](https://x.com/solidsnakedev/status/2077095154830193004)            | 201         | 12           |
| 2026-07-14 | [hydra-sdk 1.0.0](https://x.com/solidsnakedev/status/2077096548148891708)                | 169         | 5            |
| **Total**  |                                                                                          | **959**     | **51**       |

## Impact

- **Before:** interacting with a Hydra head required running the hydra-node CLI/TUI or hand-rolling WebSocket handling; no browser-ready, typed, documented client existed for dApp developers.
- **After:** `npm i @no-witness-labs/hydra-sdk` gives any web developer a typed, documented, provider-agnostic Hydra client that works in browsers with CIP-30 wallets and reconnects automatically — no server infrastructure or specialized CLI knowledge required.
- The SDK ships **two provider adapters** (evolution-sdk `HydraProvider`, MeshJS `HydraMeshProvider`) behind one interface, meeting developers in the ecosystems they already use.
- Upstream ecosystem findings were reported during development (e.g. a dead Maestro preprod host default in evolution-sdk, hydra-node/cardano-node socket era incompatibilities), benefiting other Cardano tooling teams.

## Development process

The project ran as 4 milestone-scoped releases, each gated by Catalyst Proof-of-Achievement review:

1. **Core SDK & Browser Foundations (v0.1.0, Jan 2026)** — WebSocket wrapper over the hydra-node API, browser compatibility, package/CI scaffolding.
2. **Hydra Transactions & UTXO Query (v0.2.0, Mar 2026)** — L2 transaction submission, UTxO querying, `HydraStateMachine`, CLI with standalone binaries, npm publishing automation with provenance.
3. **Provider Layer & Testnet Hardening (v0.3.0, Jun 2026)** — provider abstraction with two adapters, cross-browser/cross-platform CI matrix, node-resilience tests, hosted demo with provider-swap and recovery panels.
4. **Final (v1.0.0, Jul 2026)** — stable API declaration, complete docs (release notes, versioned API reference, tutorial), close-out deliverables.

All releases are automated: changesets drive versioning and changelogs, GitHub Actions publishes to npm with provenance and attaches CLI binaries to GitHub releases, and release announcements post to X automatically.

## Lessons learned

- **npm namespace risk:** verify package-name availability _before_ naming a proposal deliverable; `hydra-manager` was squatted, forcing a scoped rename.
- **Version-matrix pain is real:** cardano-node 10.5.x cannot serve hydra-node ≤1.2 over a local socket (era mismatch: "BabbageEra not in conway based era"). Using hydra-node's Blockfrost backend decoupled us from L1 node compatibility and unblocked testnet work.
- **Browser wallets constrain deployment:** CIP-30 wallet injection requires HTTPS, which shaped how the demo is hosted and demonstrated (wallet flows shown over HTTPS/video; provider and recovery flows on the public HTTP demo).
- **Byte-exact CBOR matters:** merging wallet witnesses into commit transactions must preserve the exact transaction body bytes; re-serializing changes the hash. Byte-level CBOR splicing fixed script-integrity mismatches.
- **Milestone-scoped releases work:** cutting a versioned, publicly verifiable release per milestone made Catalyst reviews fast and kept scope honest.
- **Automate evidence:** provenance-signed npm publishes, CI-published test reports, and auto-posted release announcements meant most milestone evidence generated itself.

## Sustainability and next steps

The SDK is maintained by No Witness Labs beyond the funded period:

- **Maintenance model:** issues and PRs via GitHub; semver guarantees from v1.0.0 (breaking changes only in majors); automated release pipeline keeps publishing costs near zero.
- **Roadmap:** hydra-node v2.0.0 support (already prototyped in [PR #81](https://github.com/no-witness-labs/hydra-sdk/pull/81)), wallet-reconnect resilience tests, HTTPS demo domain, additional provider adapters as ecosystem demand emerges.
- **Permanent availability:** source on GitHub (MIT, forkable), packages on npm with provenance, docs on GitHub Pages built from the repository.

### Recommendations for future work

- Hydra ecosystem tooling should track hydra-node majors in lockstep and document node/L1 compatibility matrices — this was the largest source of friction.
- A shared, community-maintained CIP-30 test harness would benefit every browser SDK project.
- Catalyst proposers should reserve npm/GitHub namespaces at proposal time.

## Final thoughts

Hydra is production-ready protocol machinery; what it lacked was an approachable developer surface. This project delivered that surface — typed, tested across browsers and platforms, documented, and demonstrated end-to-end on testnet — and leaves the Cardano ecosystem with a maintained, MIT-licensed on-ramp to L2 scaling.

## Links

- **GitHub organization:** https://github.com/no-witness-labs
- **Repository:** https://github.com/no-witness-labs/hydra-sdk
- **Docs:** https://no-witness-labs.github.io/hydra-sdk/
- **Demo:** http://178.63.100.104/
- **npm:** https://www.npmjs.com/package/@no-witness-labs/hydra-sdk
- **X:** https://x.com/nowitnesslabs · https://x.com/solidsnakedev
- **Social plan spreadsheet:** https://docs.google.com/spreadsheets/d/1c-uXL-_7sOoYJ-dj-Df6EOyUwtpxI7UN-lg1I9J2Vks/edit?usp=sharing
- **Close-out video:** https://youtu.be/Th3_NDU4itQ
