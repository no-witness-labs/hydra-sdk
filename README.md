# Hydra SDK

A monorepo template for TypeScript projects with modern tooling.

## Features

- **Monorepo** - pnpm workspaces with Turbo for orchestration
- **TypeScript** - Strict mode with project references
- **Testing** - Vitest with coverage
- **Linting** - ESLint 9 flat config + Prettier
- **Documentation** - Fumadocs with Twoslash and Orama search
- **Versioning** - Changesets for automated releases
- **CI/CD** - GitHub Actions workflows
- **Dev Environment** - Nix flake with direnv (optional)

## Prerequisites

- **Node.js** >= 20
- **pnpm** >= 9 (`corepack enable && corepack prepare pnpm@latest --activate`)
- **Bun** (for running init script) - `curl -fsSL https://bun.sh/install | bash`

> **Optional**: This template includes a [Nix flake](https://nixos.wiki/wiki/Flakes) with [direnv](https://direnv.net/) integration. If you have both installed, `cd` into the project and run `direnv allow` to automatically set up the dev environment.

## Using This Template

### 1. Create Your Repository

```bash
# Clone the template
git clone https://github.com/no-witness-labs/hydra-sdk.git my-project
cd my-project

# Remove the template's git history and start fresh
rm -rf .git
git init
```

### 2. Initialize the Project

Run the interactive init script:

```bash
bun scripts/init.ts
```

Or pass arguments directly:

```bash
bun scripts/init.ts \
  --name my-awesome-sdk \
  --scope @myorg/ \
  --org myorg \
  --title "My Awesome SDK" \
  --copyright "My Company Inc." \
  --year 2026
```

#### What Gets Replaced

| Placeholder                  | Example Value     | Files Affected                   |
| ---------------------------- | ----------------- | -------------------------------- |
| `hydra-sdk`                  | `my-awesome-sdk`  | package.json, configs, workflows |
| `@no-witness-labs/`          | `@myorg/`         | package.json, imports            |
| `no-witness-labs`            | `myorg`           | changeset config, docs           |
| `Hydra SDK`                  | `My Awesome SDK`  | docs title                       |
| `No Witness Labs` in LICENSE | `My Company Inc.` | LICENSE                          |
| `2026` in LICENSE            | `2026`            | LICENSE                          |

<details>
<summary>Manual replacement (alternative)</summary>

If you prefer manual replacement, set environment variables and use sed:

```bash
export PROJECT_NAME="my-awesome-project"
export PROJECT_SCOPE="@my-org"
export GITHUB_ORG="my-org"
export PROJECT_TITLE="My Awesome Project"
```

```bash
# macOS
find . -type f \( -name "*.json" -o -name "*.ts" -o -name "*.tsx" -o -name "*.mjs" -o -name "*.yml" -o -name "*.mdx" \) \
  -not -path "./node_modules/*" \
  -not -path "./.git/*" \
  -not -path "./.source/*" \
  -exec sed -i '' "s/hydra-sdk/${PROJECT_NAME}/g" {} +

find . -type f \( -name "*.json" -o -name "*.ts" -o -name "*.tsx" -o -name "*.mdx" \) \
  -not -path "./node_modules/*" \
  -not -path "./.git/*" \
  -not -path "./.source/*" \
  -exec sed -i '' "s/@template\//${PROJECT_SCOPE}\//g" {} +

find . -type f \( -name "*.json" -o -name "*.ts" -o -name "*.tsx" -o -name "*.mdx" \) \
  -not -path "./node_modules/*" \
  -not -path "./.git/*" \
  -not -path "./.source/*" \
  -exec sed -i '' "s/no-witness-labs/${GITHUB_ORG}/g" {} +

find . -type f \( -name "*.tsx" -o -name "*.mdx" \) \
  -not -path "./node_modules/*" \
  -not -path "./.git/*" \
  -not -path "./.source/*" \
  -exec sed -i '' "s/Hydra SDK/${PROJECT_TITLE}/g" {} +
```

Don't forget to update the LICENSE file manually with your copyright info.

</details>

### 3. Install Dependencies

```bash
pnpm install
```

### 4. Verify Setup

```bash
pnpm build    # Build all packages
pnpm test     # Run tests
pnpm lint     # Lint code
```

### 5. Update Documentation

- Edit `docs/content/docs/index.mdx` - Update the home page
- Edit `docs/content/docs/getting-started.mdx` - Update getting started guide
- Edit `docs/content/docs/core.mdx` - Update or rename for your package

### 6. Push to GitHub

```bash
git add .
git commit -m "Initial commit from template"
git remote add origin "https://github.com/${GITHUB_ORG}/${PROJECT_NAME}.git"
git push -u origin main
```

## Project Structure

```text
.
├── packages/              # Workspace packages
│   └── core/              # Example package (rename or replace)
│       ├── src/           # Source code
│       ├── test/          # Tests
│       └── package.json
├── docs/                  # Documentation site (Fumadocs)
│   ├── app/               # Next.js App Router
│   ├── content/docs/      # MDX documentation
│   └── components/        # React components
├── .changeset/            # Changeset configuration
├── .github/workflows/     # GitHub Actions
│   ├── ci.yml             # CI pipeline
│   ├── release.yml        # Release automation
│   └── docs.yml           # Docs deployment
├── turbo.json             # Turbo configuration
├── vitest.config.ts       # Vitest configuration
├── eslint.config.mjs      # ESLint configuration
└── tsconfig.base.json     # Base TypeScript config
```

## Scripts

| Script              | Description                     |
| ------------------- | ------------------------------- |
| `pnpm build`        | Build all packages              |
| `pnpm dev`          | Start development mode          |
| `pnpm test`         | Run tests                       |
| `pnpm coverage`     | Run tests with coverage         |
| `pnpm lint`         | Lint code                       |
| `pnpm lint:fix`     | Lint and fix code               |
| `pnpm format`       | Format code with Prettier       |
| `pnpm format:check` | Check code formatting           |
| `pnpm type-check`   | Type check all packages         |
| `pnpm clean`        | Clean build outputs             |
| `pnpm circular`     | Check for circular dependencies |
| `pnpm changeset`    | Create a changeset              |

## Adding a New Package

Create a new directory and copy the configuration:

```bash
# Create directory
mkdir -p packages/my-package/{src,test}

# Copy configuration
cp packages/core/package.json packages/my-package/
cp packages/core/tsconfig*.json packages/my-package/
cp packages/core/vitest.config.ts packages/my-package/
```

Update `packages/my-package/package.json`:

```json
{
  "name": "@your-scope/my-package",
  "version": "0.0.1"
}
```

Create your entry point and build:

```bash
echo 'export const hello = () => "Hello!"' > packages/my-package/src/index.ts
pnpm install
pnpm build
```

## Documentation

The docs site uses [Fumadocs](https://fumadocs.dev/) with:

- **Twoslash** - TypeScript type information in code blocks
- **Orama** - Full-text search
- **MDX** - Markdown with React components
- **Playground** - Interactive StackBlitz sandbox at `/playground`

### Running Docs Locally

```bash
pnpm --filter docs dev
```

This starts the docs site at `http://localhost:3000`.

### Development Workflow

When updating JSDoc or types in packages, the docs site needs a fresh start to pick up the changes:

```bash
# 1. Rebuild the package
pnpm --filter @no-witness-labs/core build

# 2. Restart the docs dev server (Ctrl+C, then run again)
cd docs && pnpm dev
```

If types still appear stale, clear the caches:

```bash
cd docs && pnpm clean && pnpm dev
```

This clears `.next`, `out`, and `.turbo` directories which may cache old type information.

### Adding Documentation

1. Create MDX files in `docs/content/docs/`
1. Update `docs/content/docs/meta.json` to add navigation

### Deploying Docs

Docs are automatically deployed to GitHub Pages on push to `main`. Enable GitHub Pages in your repository settings:

1. Go to Settings > Pages
1. Set Source to "GitHub Actions"

## Release Process

This template uses [Changesets](https://github.com/changesets/changesets) for versioning.

1. Make your changes
1. Create a changeset: `pnpm changeset`
1. Push to `main` branch
1. The release workflow creates a PR to bump versions
1. Merge the PR to publish packages to npm

### Setting Up npm Publishing

Add `NPM_TOKEN` to your repository secrets:

1. Go to Settings > Secrets and variables > Actions
1. Add `NPM_TOKEN` with your npm access token

## License

MIT
