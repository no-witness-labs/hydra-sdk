---
name: Release Checklist
about: Checklist for publishing a new release
title: "Release v"
labels: release
assignees: ""
---

## Pre-Release

- [ ] All PRs for this release are merged to `main`
- [ ] Changeset added (`pnpm changeset`)
- [ ] CI is green on `main`
- [ ] Documentation is up to date
- [ ] Breaking changes documented in changeset

## Release

- [ ] Changeset version PR created (automatic on push to main)
- [ ] Review version bumps and generated changelog
- [ ] Merge changeset version PR
- [ ] Verify npm publish succeeded (check [npm](https://www.npmjs.com/org/no-witness-labs))
- [ ] Verify GitHub Release created with notes

## Post-Release

- [ ] Test installation: `pnpm add @no-witness-labs/hydra-sdk@latest`
- [ ] Verify provenance attestation on npm
- [ ] Announce release (if significant)

## Packages in this release

- [ ] `@no-witness-labs/hydra-sdk` — v
- [ ] `@no-witness-labs/hydra-sdk-cli` — v
- [ ] `@no-witness-labs/hydra-devnet` — v
