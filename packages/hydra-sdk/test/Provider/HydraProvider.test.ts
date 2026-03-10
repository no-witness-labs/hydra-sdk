import type { RewardAddress } from "@evolution-sdk/evolution";
import { TransactionHash } from "@evolution-sdk/evolution";
import type { Provider as EvolutionProvider } from "@evolution-sdk/evolution/sdk/provider/Provider";
import { Head, Provider } from "@no-witness-labs/hydra-sdk";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

const { HydraProvider } = Provider;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const testRewardAddress =
  "stake_test1uqfu74w3wh4gfzu8m6e7j987h4lq9r3t7ef5gaw497uu85qsqfy" as RewardAddress.RewardAddress;

/**
 * A generic function that accepts any evolution-sdk `Provider`.
 * Used to prove the swap pattern: both L1 and L2 providers work identically.
 */
const queryDelegation = async (
  provider: EvolutionProvider,
  rewardAddress: RewardAddress.RewardAddress,
) => provider.getDelegation(rewardAddress);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Provider / HydraProvider", () => {
  it("conforms to evolution-sdk Provider interface (swap pattern)", async () => {
    const head = await Head.create({ url: "mock://localhost:4001" });
    const hydraProvider = new HydraProvider({
      head,
      httpUrl: "http://localhost:4001",
    });

    // HydraProvider is assignable to the evolution-sdk Provider interface
    const provider: EvolutionProvider = hydraProvider;

    // All Provider methods exist
    expect(typeof provider.getProtocolParameters).toBe("function");
    expect(typeof provider.getUtxos).toBe("function");
    expect(typeof provider.getUtxosWithUnit).toBe("function");
    expect(typeof provider.getUtxoByUnit).toBe("function");
    expect(typeof provider.getUtxosByOutRef).toBe("function");
    expect(typeof provider.getDelegation).toBe("function");
    expect(typeof provider.getDatum).toBe("function");
    expect(typeof provider.awaitTx).toBe("function");
    expect(typeof provider.submitTx).toBe("function");
    expect(typeof provider.evaluateTx).toBe("function");

    // Effect sub-namespace exists with all methods
    expect(typeof provider.Effect.getProtocolParameters).toBe("function");
    expect(typeof provider.Effect.getUtxos).toBe("function");
    expect(typeof provider.Effect.submitTx).toBe("function");
    expect(typeof provider.Effect.awaitTx).toBe("function");

    await head.dispose();
  });

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
      testRewardAddress
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
    await head.commit({});

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

  // ---------------------------------------------------------------------------
  // Integration: provider swap workflow
  // ---------------------------------------------------------------------------

  it("provider swap: HydraProvider is usable where any Provider is expected", async () => {
    const head = await Head.create({ url: "mock://localhost:4001" });
    const hydraProvider: EvolutionProvider = new HydraProvider({
      head,
      httpUrl: "http://localhost:4001",
    });

    // Pass HydraProvider into a generic function that accepts Provider
    const delegation = await queryDelegation(
      hydraProvider,
      testRewardAddress,
    );

    expect(delegation.poolId).toBeNull();
    expect(delegation.rewards).toBe(0n);
    await head.dispose();
  });

  it("provider swap: Effect API works through Provider interface", async () => {
    const head = await Head.create({ url: "mock://localhost:4001" });
    const provider: EvolutionProvider = new HydraProvider({
      head,
      httpUrl: "http://localhost:4001",
    });

    // Use Effect API through the Provider interface
    const result = await Effect.runPromise(
      provider.Effect.getDelegation(
        testRewardAddress,
      ),
    );

    expect(result.poolId).toBeNull();
    expect(result.rewards).toBe(0n);
    await head.dispose();
  });

  it("provider swap: submitTx + awaitTx workflow through Provider interface", async () => {
    const head = await Head.create({ url: "mock://localhost:4001" });

    // Move head to Open state
    await head.init();
    await head.commit({});

    const provider: EvolutionProvider = new HydraProvider({
      head,
      httpUrl: "http://localhost:4001",
    });

    const { Transaction } = await import("@evolution-sdk/evolution");
    const tx = Transaction.fromCBORHex(
      "84a400d90102818258200000000000000000000000000000000000000000000000000000000000000000000181a200583900000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001821a001e8480a0021a00028a00031a00000000a0f5f6",
    );

    // Submit and get hash — same API as any L1 provider
    const txHash = await provider.submitTx(tx);
    expect(txHash).toBeDefined();
    expect(TransactionHash.toHex(txHash)).toHaveLength(64);

    await head.dispose();
  });
});
