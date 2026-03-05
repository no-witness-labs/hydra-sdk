import { TransactionHash } from "@evolution-sdk/evolution";
import { Head, Provider } from "@no-witness-labs/hydra-sdk";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

const { HydraProvider } = Provider;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Provider / HydraProvider", () => {
  it("constructs with a head and httpUrl", async () => {
    const head = await Head.create({ url: "mock://localhost:4001" });
    const provider = new HydraProvider({
      head,
      httpUrl: "http://localhost:4001",
    });

    expect(provider).toBeDefined();
    expect(provider.Effect).toBeDefined();
    await head.dispose();
  });

  it("getDelegation returns empty delegation", async () => {
    const head = await Head.create({ url: "mock://localhost:4001" });
    const provider = new HydraProvider({
      head,
      httpUrl: "http://localhost:4001",
    });

    const delegation = await provider.getDelegation(
      "stake_test1uqfu74w3wh4gfzu8m6e7j987h4lq9r3t7ef5gaw497uu85qsqfy"
    );

    expect(delegation.poolId).toBeNull();
    expect(delegation.rewards).toBe(0n);
    await head.dispose();
  });

  it("evaluateTx throws ProviderError", async () => {
    const head = await Head.create({ url: "mock://localhost:4001" });
    const provider = new HydraProvider({
      head,
      httpUrl: "http://localhost:4001",
    });

    await expect(provider.evaluateTx(undefined as never)).rejects.toThrow(
      "evaluateTx is not supported on Hydra L2",
    );
    await head.dispose();
  });

  it("Effect.evaluateTx fails with ProviderError", async () => {
    const head = await Head.create({ url: "mock://localhost:4001" });
    const provider = new HydraProvider({
      head,
      httpUrl: "http://localhost:4001",
    });

    const result = await Effect.runPromiseExit(
      provider.Effect.evaluateTx(undefined as never),
    );

    expect(result._tag).toBe("Failure");
    await head.dispose();
  });

  it("submitTx sends NewTx via WebSocket and returns txHash", async () => {
    const head = await Head.create({ url: "mock://localhost:4001" });

    // Move head to Open state: Init → Commit → Open
    await head.init();
    await head.commit([]);

    const provider = new HydraProvider({
      head,
      httpUrl: "http://localhost:4001",
    });

    // Build a minimal valid transaction for testing
    // The mock transport returns TxValid with the txId we send
    const { Transaction } = await import("@evolution-sdk/evolution");
    // Use a full Conway-era transaction CBOR (body + witness set + isValid + auxiliaryData)
    const tx = Transaction.fromCBORHex(
      "84a400d90102818258200000000000000000000000000000000000000000000000000000000000000000000181a200583900000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001821a001e8480a0021a00028a00031a00000000a0f5f6",
    );

    const txHash = await provider.submitTx(tx);
    expect(txHash).toBeDefined();
    expect(TransactionHash.toHex(txHash)).toBeTruthy();

    await head.dispose();
  });
});
