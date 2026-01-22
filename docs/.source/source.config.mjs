// source.config.ts
import { rehypeCodeDefaultOptions } from "fumadocs-core/mdx-plugins";
import { defineConfig, defineDocs, frontmatterSchema, metaSchema } from "fumadocs-mdx/config";
import { transformerTwoslash } from "fumadocs-twoslash";
import { createFileSystemTypesCache } from "fumadocs-twoslash/cache-fs";
var isDev = process.env.NODE_ENV === "development";
var docs = defineDocs({
  docs: {
    schema: frontmatterSchema
  },
  meta: {
    schema: metaSchema
  }
});
var source_config_default = defineConfig({
  mdxOptions: {
    rehypeCodeOptions: {
      lazy: true,
      themes: {
        light: "github-light",
        dark: "github-dark"
      },
      langs: ["ts", "tsx", "js", "jsx", "bash", "sh", "json"],
      transformers: [
        ...rehypeCodeDefaultOptions.transformers ?? [],
        transformerTwoslash({
          // Disable cache in dev to always get fresh types from packages
          typesCache: isDev ? void 0 : createFileSystemTypesCache()
        })
      ]
    }
  }
});
export {
  source_config_default as default,
  docs
};
