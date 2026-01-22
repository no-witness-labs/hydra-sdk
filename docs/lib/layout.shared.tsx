import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared"

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: "TypeScript Project Template"
    },
    links: [
      {
        text: "Playground",
        url: "/playground"
      },
      {
        text: "GitHub",
        url: "https://github.com/no-witness-labs/typescript-project-template",
        external: true
      }
    ]
  }
}
