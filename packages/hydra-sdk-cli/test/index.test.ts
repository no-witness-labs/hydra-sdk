import { Head } from "@no-witness-labs/hydra-sdk-cli";
import { describe, expect, it } from "vitest";

describe("CLI / Head integration", () => {
  it("creates a head with mock transport and reads status", async () => {
    const head = await Head.create({ url: "mock://localhost:4001" });
    expect(head.getState()).toBe("Idle");
    await head.dispose();
  });

  it("runs init -> status check via mock transport", async () => {
    const head = await Head.create({ url: "mock://localhost:4001" });

    await head.init();
    expect(head.getState()).toBe("Initializing");

    await head.dispose();
  });
});
