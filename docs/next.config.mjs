import { createMDX } from "fumadocs-mdx/next"

const withMDX = createMDX()

const isCI = !!process.env.GITHUB_ACTIONS
/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  output: "export",
  distDir: "out",
  basePath: isCI ? "/hydra-sdk" : "",
  assetPrefix: isCI ? "/hydra-sdk" : "",
  trailingSlash: true,
  images: {
    unoptimized: true
  },
  serverExternalPackages: ["typescript", "twoslash"]
}

export default withMDX(config)
