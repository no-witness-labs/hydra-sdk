/**
 * Minimal dev server for Playwright browser tests.
 *
 * - Bundles the SDK with esbuild for browser consumption
 * - Serves a test harness HTML page at /
 * - Serves the SDK bundle at /hydra-sdk.js
 */
import { buildSync } from "esbuild";
import { createServer } from "http";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 3999;

// Bundle the SDK for browser as IIFE (global `HydraSDK`)
const result = buildSync({
  entryPoints: [join(__dirname, "../../src/index.ts")],
  bundle: true,
  format: "iife",
  globalName: "HydraSDK",
  platform: "browser",
  target: "es2022",
  outfile: join(__dirname, "dist/hydra-sdk.js"),
  write: false,
  define: {
    "process.versions": "{}",
    "process.env": "{}",
    "process.stdout": "undefined",
  },
});

const sdkBundle = result.outputFiles[0].text;

const html = readFileSync(join(__dirname, "index.html"), "utf-8");

const server = createServer((req, res) => {
  if (req.url === "/hydra-sdk.js") {
    res.writeHead(200, { "Content-Type": "application/javascript" });
    res.end(sdkBundle);
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(html);
});

server.listen(PORT, () => {
  console.log(`Browser test server listening on http://localhost:${PORT}`);
});
