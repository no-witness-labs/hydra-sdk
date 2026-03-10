# Contributing

Thank you for your interest in contributing! This document provides guidelines for contributing to this project.

## Development Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/[GITHUB_ORG]/[PROJECT_NAME].git
   cd [PROJECT_NAME]
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Build all packages**

   ```bash
   pnpm build
   ```

4. **Run tests**

   ```bash
   pnpm test
   ```

## Development Workflow

1. Create a new branch from `main`

   ```bash
   git checkout -b feature/my-feature
   ```

2. Make your changes

3. Run checks before committing

   ```bash
   pnpm type-check
   pnpm lint
   pnpm test
   pnpm format
   ```

4. Commit your changes (see commit conventions below)

5. Push and open a Pull Request

## Code Style

- **TypeScript** - All code must be written in TypeScript with strict mode
- **Formatting** - Run `pnpm format` before committing
- **Linting** - Run `pnpm lint` and fix any issues
- **Type Safety** - Avoid `any` types; use `unknown` and type guards instead

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

[optional body]

[optional footer]
```

### Types

- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation changes
- `style` - Code style changes (formatting, etc.)
- `refactor` - Code refactoring
- `perf` - Performance improvements
- `test` - Adding or updating tests
- `chore` - Maintenance tasks

### Examples

```
feat(core): add new validation function
fix(core): handle edge case in parser
docs: update installation instructions
chore: update dependencies
```

## Pull Request Process

1. Ensure all checks pass (`pnpm type-check`, `pnpm lint`, `pnpm test`)
2. Update documentation if needed
3. Add a changeset if your change affects published packages:

   ```bash
   pnpm changeset
   ```

4. Request review from maintainers
5. Address review feedback
6. Squash and merge once approved

## Adding a Changeset

For any change that should be released, create a changeset:

```bash
pnpm changeset
```

Follow the prompts to:

1. Select affected packages
2. Choose version bump type (patch/minor/major)
3. Write a summary of the change

## Integration Tests

Integration tests run against a real Hydra devnet (Docker-based) and exercise the full Head lifecycle.

### Prerequisites

- **Docker** must be running (Docker Desktop, OrbStack, or similar)
- If using OrbStack, set `DOCKER_HOST=unix:///var/run/docker.sock` (dockerode defaults to the Docker Desktop socket)

### Running Integration Tests

```bash
# From the repo root
pnpm --filter @no-witness-labs/hydra-sdk test:integration

# Or from the hydra-sdk package directory
cd packages/hydra-sdk
pnpm test:integration
```

Integration tests are **excluded** from the default `pnpm test` run. They use a separate vitest config (`vitest.integration.config.ts`) with extended timeouts (600s per test, 300s for setup hooks).

### What the Tests Cover

| Test               | Flow                                                     |
| ------------------ | -------------------------------------------------------- |
| Full lifecycle     | Init → Commit → Open → Close → Fanout                    |
| NewTx rejection    | Open → NewTx (invalid) → stays Open                      |
| Abort path         | Init → Abort → Aborted                                   |
| Event subscription | `subscribe()` delivers lifecycle events                  |
| Reconnection       | Hydra-node restart → SDK reconnects with state preserved |

### How It Works

Each test suite spins up its own `@no-witness-labs/hydra-devnet` cluster with unique ports. The cluster includes a Cardano node and Hydra node running in Docker containers. Tests use the SDK's `Head.create()` API to connect and drive the protocol.

### CI

Integration tests run automatically in CI via the `integration.yml` workflow on pushes to `main` and pull requests.

## Questions?

Feel free to open an issue for any questions or concerns.
