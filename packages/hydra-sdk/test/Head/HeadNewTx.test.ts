import { Head } from "@no-witness-labs/hydra-sdk";
import { describe, expect, it } from "vitest";

describe("Head / NewTx command", () => {
  it("sends NewTx in Open state via mock transport", async () => {
    const head = await Head.create({ url: "mock://localhost:4001" });

    // Move to Open: Init → Commit → Open
    await head.init();
    await head.commit({});
    expect(head.getState()).toBe("Open");

    await head.newTx({
      type: "Tx ConwayEra",
      description: "Ledger Cddl Format",
      cborHex: "84a400d9010280018002000300a0f5f6",
      txId: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    });

    // Should still be in Open state after submitting a tx
    expect(head.getState()).toBe("Open");

    await head.dispose();
  });

  it("rejects NewTx when head is not Open", async () => {
    const head = await Head.create({ url: "mock://localhost:4001" });
    expect(head.getState()).toBe("Idle");

    await expect(
      head.newTx({
        type: "Tx ConwayEra",
        description: "Ledger Cddl Format",
        cborHex: "84a400d9010280018002000300a0f5f6",
        txId: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      }),
    ).rejects.toThrow("Command NewTx is not allowed while head is Idle");

    await head.dispose();
  });

  it("emits TxValid event after NewTx", async () => {
    const head = await Head.create({ url: "mock://localhost:4001" });

    await head.init();
    await head.commit({});

    const events: Array<{ tag: string; payload?: unknown }> = [];
    const unsub = head.subscribe((event) => {
      if (event.tag === "TxValid") {
        events.push(event);
      }
    });

    const txId =
      "cafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabe";

    await head.newTx({
      type: "Tx ConwayEra",
      description: "Ledger Cddl Format",
      cborHex: "84a400d9010280018002000300a0f5f6",
      txId,
    });

    // Mock transport emits TxValid with the txId
    expect(events).toHaveLength(1);
    const payload = events[0].payload as { transactionId?: string };
    expect(payload.transactionId).toBe(txId);

    unsub();
    await head.dispose();
  });
});
