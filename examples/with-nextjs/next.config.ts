import type { NextConfig } from "next";

const config: NextConfig = {
  // Allow WebSocket connections to hydra-node from the browser
  async rewrites() {
    const hydraHttpUrl = process.env.HYDRA_HTTP_URL ?? "http://localhost:4001";
    return [
      {
        source: "/hydra/:path*",
        destination: `${hydraHttpUrl}/:path*`,
      },
    ];
  },
  serverExternalPackages: ["@no-witness-labs/hydra-sdk", "effect"],
};

export default config;
