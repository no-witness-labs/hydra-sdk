// @ts-nocheck -- skip type checking
import * as d_docs_4 from "../content/docs/modules/index.mdx?collection=docs"
import * as d_docs_3 from "../content/docs/modules/core.mdx?collection=docs"
import * as d_docs_2 from "../content/docs/index.mdx?collection=docs"
import * as d_docs_1 from "../content/docs/getting-started.mdx?collection=docs"
import * as d_docs_0 from "../content/docs/core.mdx?collection=docs"
import { _runtime } from "fumadocs-mdx/runtime/next"
import * as _source from "../source.config"
export const docs = _runtime.docs<typeof _source.docs>([{ info: {"path":"core.mdx","fullPath":"content/docs/core.mdx"}, data: d_docs_0 }, { info: {"path":"getting-started.mdx","fullPath":"content/docs/getting-started.mdx"}, data: d_docs_1 }, { info: {"path":"index.mdx","fullPath":"content/docs/index.mdx"}, data: d_docs_2 }, { info: {"path":"modules/core.mdx","fullPath":"content/docs/modules/core.mdx"}, data: d_docs_3 }, { info: {"path":"modules/index.mdx","fullPath":"content/docs/modules/index.mdx"}, data: d_docs_4 }], [{"info":{"path":"meta.json","fullPath":"content/docs/meta.json"},"data":{"title":"Documentation","pages":["getting-started","core","modules"]}}, {"info":{"path":"modules/meta.json","fullPath":"content/docs/modules/meta.json"},"data":{"title":"API Reference","pages":["core"]}}])