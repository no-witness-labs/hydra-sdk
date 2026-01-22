import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts", "test/**/*.spec.ts"],
    alias: {
      "@template/core": new URL("./src/index.ts", import.meta.url).pathname
    }
  }
})
