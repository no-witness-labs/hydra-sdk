import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared"

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: "Hydra SDK"
    },
    links: [
      {
        text: "Playground",
        url: "/playground"
      },
      {
        text: "GitHub",
        url: "https://github.com/no-witness-labs/hydra-sdk",
        external: true
      }
    ]
  }
}
