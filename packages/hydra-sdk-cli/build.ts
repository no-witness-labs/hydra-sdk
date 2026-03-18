/**
 * Bun compile script for building standalone CLI binaries.
 *
 * Usage:
 *   bun run build.ts                              # build for current platform
 *   bun run build.ts --target bun-linux-x64       # cross-compile
 *   bun run build.ts --outfile bin/hydra           # custom output path
 */

const args = process.argv.slice(2);

function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

const target = getArg("target", `bun-${process.platform === "darwin" ? "darwin" : "linux"}-${process.arch === "arm64" ? "arm64" : "x64"}`) as
  | "bun-linux-x64"
  | "bun-linux-arm64"
  | "bun-darwin-arm64"
  | "bun-darwin-x64"
  | "bun-windows-x64";

const defaultOutfile = target.includes("windows") ? "bin/hydra.exe" : "bin/hydra";
const outfile = getArg("outfile", defaultOutfile);

// Resolve workspace package paths for pnpm compatibility.
// pnpm uses symlinks that Bun's bundler can't always follow in CI.
import { resolve, dirname } from "path";

const packagesDir = dirname(import.meta.dir);
const workspacePackages: Record<string, string> = {
  "@no-witness-labs/hydra-sdk": resolve(packagesDir, "hydra-sdk/src/index.ts"),
  "@no-witness-labs/hydra-sdk/provider": resolve(packagesDir, "hydra-sdk/src/Provider/index.ts"),
  "@no-witness-labs/hydra-devnet": resolve(packagesDir, "hydra-devnet/src/index.ts"),
};

const result = await Bun.build({
  entrypoints: ["./src/index.ts"],
  compile: { outfile },
  target,
  minify: true,
  sourcemap: "none",
  plugins: [
    {
      name: "resolve-workspace-and-stubs",
      setup(build) {
        // Resolve workspace packages to their source paths
        for (const [pkg, srcPath] of Object.entries(workspacePackages)) {
          const escaped = pkg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          build.onResolve({ filter: new RegExp(`^${escaped}$`) }, () => ({
            path: srcPath,
          }));
        }

        // ink conditionally imports react-devtools-core (dev-only, behind try/catch).
        // It's not available in a standalone binary — stub it out.
        build.onResolve({ filter: /^react-devtools-core$/ }, () => ({
          path: "react-devtools-core",
          namespace: "stub",
        }));
        build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
          contents: "export default undefined;",
          loader: "js",
        }));
      },
    },
  ],
});

if (!result.success) {
  console.error("Build failed:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

// Bun.build with compile writes the binary to outfile directly
console.log(`Built ${outfile} for ${target}`);
