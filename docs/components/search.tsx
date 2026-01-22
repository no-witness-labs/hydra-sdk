"use client"
import { create } from "@orama/orama"
import { useDocsSearch } from "fumadocs-core/search/client"
import {
  SearchDialog,
  SearchDialogClose,
  SearchDialogContent,
  SearchDialogHeader,
  SearchDialogIcon,
  SearchDialogInput,
  SearchDialogList,
  SearchDialogOverlay,
  type SharedProps
} from "fumadocs-ui/components/dialog/search"
import { useI18n } from "fumadocs-ui/contexts/i18n"

async function initOrama() {
  return await create({
    schema: { _: "string" },
    language: "english"
  })
}

export default function DefaultSearchDialog(props: SharedProps) {
  const { locale } = useI18n()
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ""
  const normalizedBase = basePath.endsWith("/") && basePath.length > 1 ? basePath.slice(0, -1) : basePath
  const apiFrom = `${normalizedBase}/api/search`

  const { query, search, setSearch } = useDocsSearch({
    type: "static",
    initOrama,
    locale,
    from: apiFrom
  })

  return (
    <SearchDialog search={search} onSearchChange={setSearch} isLoading={query.isLoading} {...props}>
      <SearchDialogOverlay />
      <SearchDialogContent>
        <SearchDialogHeader>
          <SearchDialogIcon />
          <SearchDialogInput />
          <SearchDialogClose />
        </SearchDialogHeader>
        <SearchDialogList items={query.data !== "empty" ? query.data : null} />
      </SearchDialogContent>
    </SearchDialog>
  )
}
