import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/integration/**/*.test.ts"],
    testTimeout: 600_000,
    hookTimeout: 300_000,
    alias: {
      "@no-witness-labs/hydra-sdk": new URL("./src/index.ts", import.meta.url)
        .pathname,
      "@no-witness-labs/hydra-devnet": new URL(
        "../hydra-devnet/src/index.ts",
        import.meta.url,
      ).pathname,
    },
  },
});
