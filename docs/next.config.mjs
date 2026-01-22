import { createMDX } from "fumadocs-mdx/next"

const withMDX = createMDX()

const isCI = !!process.env.GITHUB_ACTIONS
/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  output: "export",
  distDir: "out",
  basePath: isCI ? "/typescript-project-template" : "",
  assetPrefix: isCI ? "/typescript-project-template" : "",
  trailingSlash: true,
  images: {
    unoptimized: true
  },
  serverExternalPackages: ["typescript", "twoslash"]
}

export default withMDX(config)
