import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    sequence: { concurrent: false },
    include: ["test/**/*.test.ts", "test/**/*.spec.ts"],
    alias: {
      "@no-witness-labs/hydra-devnet": new URL(
        "./src/index.ts",
        import.meta.url,
      ).pathname,
    },
  },
});
