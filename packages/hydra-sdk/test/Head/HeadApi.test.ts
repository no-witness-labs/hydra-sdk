import { Head } from "@no-witness-labs/hydra-sdk";
import { Effect, Stream } from "effect";
import { describe, expect, it } from "vitest";

describe("Head module", () => {
  it("runs init -> close -> fanout in Promise API", async () => {
    const head = await Head.create({ url: "mock://localhost:4001" });

    await head.init();
    // NOTE(scaffold): Commit is treated as a mock-only operation in this test path.
    // Real Hydra commit integration belongs to REST, not websocket transport.
    await head.commit({});
    await head.close();
    await head.fanout();

    expect(head.getState()).toBe("Final");

    await head.dispose();
  });

  it("rejects invalid lifecycle transitions from FSM", async () => {
    const head = await Head.create({ url: "mock://localhost:4001" });

    await expect.poll(() => head.getState()).toBe("Idle");

    await expect(head.close()).rejects.toThrow(
      "Command Close is not allowed while head is Idle",
    );

    await head.dispose();
  });

  it("provides real effect events stream", async () => {
    const head = await Head.create({ url: "mock://localhost:4001" });

    const program = Stream.take(head.effect.events(), 1).pipe(
      Stream.runCollect,
    );

    const collectedPromise = Effect.runPromise(program);
    await head.init();

    const collected = await collectedPromise;
    const tags = Array.from(collected).map((event) => event.tag);

    expect(tags).toContain("HeadIsInitializing");

    await head.dispose();
  });
});
