import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts", "test/**/*.spec.ts"],
    exclude: ["test/integration/**", "test/browser/**"],
    alias: {
      "@no-witness-labs/hydra-sdk": new URL("./src/index.ts", import.meta.url)
        .pathname,
    },
  },
});
