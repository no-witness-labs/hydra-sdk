import { rehypeCodeDefaultOptions } from "fumadocs-core/mdx-plugins"
import { defineConfig, defineDocs, frontmatterSchema, metaSchema } from "fumadocs-mdx/config"
import { transformerTwoslash } from "fumadocs-twoslash"
import { createFileSystemTypesCache } from "fumadocs-twoslash/cache-fs"

// Only enable twoslash cache in production to avoid stale types during development
const isDev = process.env.NODE_ENV === "development"

export const docs = defineDocs({
  docs: {
    schema: frontmatterSchema
  },
  meta: {
    schema: metaSchema
  }
})

export default defineConfig({
  mdxOptions: {
    rehypeCodeOptions: {
      lazy: true,
      themes: {
        light: "github-light",
        dark: "github-dark"
      },
      langs: ["ts", "tsx", "js", "jsx", "bash", "sh", "json"],
      transformers: [
        ...(rehypeCodeDefaultOptions.transformers ?? []),
        transformerTwoslash({
          // Disable cache in dev to always get fresh types from packages
          typesCache: isDev ? undefined : createFileSystemTypesCache()
        })
      ]
    }
  }
})
