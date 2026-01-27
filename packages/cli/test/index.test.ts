import { describe, expect, it } from "@effect/vitest";
import { statusHead } from "@no-witness-labs/cli";
import { Effect } from "effect";

describe("core", () => {
  describe("statusHead", () => {
    it.effect("does not throw errors", () =>
      Effect.gen(function* () {
        yield* statusHead;
      }),
    );
  });
});
