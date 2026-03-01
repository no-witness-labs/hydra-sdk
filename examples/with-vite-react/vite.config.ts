import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      ws: path.resolve(__dirname, "src/ws-shim.ts"),
    },
  },
  optimizeDeps: {
    include: ["effect", "@effect/platform"],
  },
  server: {
    proxy: {
      "/hydra": {
        target: "http://38.242.137.103:4001",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/hydra/, ""),
      },
    },
  },
});
