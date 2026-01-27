import { statusHead } from "@no-witness-labs/cli"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"

describe("core", () => {
  describe("statusHead", () => {
    it.effect("does not throw errors", () =>
      Effect.gen(function* () {
        yield* statusHead
    }))
  })
})
