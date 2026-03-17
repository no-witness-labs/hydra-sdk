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

const result = await Bun.build({
  entrypoints: ["./src/index.ts"],
  compile: { outfile },
  target,
  minify: true,
  sourcemap: "none",
  plugins: [
    {
      name: "stub-optional-deps",
      setup(build) {
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
