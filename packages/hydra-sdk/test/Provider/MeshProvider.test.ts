import type {
  IEvaluator,
  IFetcher,
  IListener,
  ISubmitter,
} from "@meshsdk/common";
import { Head, Provider } from "@no-witness-labs/hydra-sdk";
import { describe, expect, it } from "vitest";

const { HydraMeshProvider } = Provider;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Provider / HydraMeshProvider", () => {
  it("implements IFetcher, ISubmitter, IEvaluator, IListener interfaces", async () => {
    const head = await Head.create({ url: "mock://localhost:4001" });
    const provider = new HydraMeshProvider({
      head,
      httpUrl: "http://localhost:4001",
    });

    // Assignable to all MeshJS interfaces
    const fetcher: IFetcher = provider;
    const submitter: ISubmitter = provider;
    const evaluator: IEvaluator = provider;
    const listener: IListener = provider;

    // IFetcher methods exist
    expect(typeof fetcher.fetchAddressUTxOs).toBe("function");
    expect(typeof fetcher.fetchUTxOs).toBe("function");
    expect(typeof fetcher.fetchProtocolParameters).toBe("function");
    expect(typeof fetcher.fetchAccountInfo).toBe("function");
    expect(typeof fetcher.fetchBlockInfo).toBe("function");
    expect(typeof fetcher.fetchTxInfo).toBe("function");
    expect(typeof fetcher.fetchAssetAddresses).toBe("function");
    expect(typeof fetcher.fetchAssetMetadata).toBe("function");
    expect(typeof fetcher.fetchCollectionAssets).toBe("function");
    expect(typeof fetcher.fetchAddressTxs).toBe("function");
    expect(typeof fetcher.fetchGovernanceProposal).toBe("function");
    expect(typeof fetcher.get).toBe("function");

    // ISubmitter
    expect(typeof submitter.submitTx).toBe("function");

    // IEvaluator
    expect(typeof evaluator.evaluateTx).toBe("function");

    // IListener
    expect(typeof listener.onTxConfirmed).toBe("function");

    await head.dispose();
  });

  it("constructs with a head and httpUrl", async () => {
    const head = await Head.create({ url: "mock://localhost:4001" });
    const provider = new HydraMeshProvider({
      head,
      httpUrl: "http://localhost:4001",
    });

    expect(provider).toBeDefined();
    await head.dispose();
  });

  // ---------------------------------------------------------------------------
  // L1-only methods throw "not supported"
  // ---------------------------------------------------------------------------

  it("fetchAccountInfo throws not-supported error", async () => {
    const head = await Head.create({ url: "mock://localhost:4001" });
    const provider = new HydraMeshProvider({
      head,
      httpUrl: "http://localhost:4001",
    });

    expect(() => provider.fetchAccountInfo("addr_test1...")).toThrow(
      "not supported on Hydra L2",
    );
    await head.dispose();
  });

  it("fetchBlockInfo throws not-supported error", async () => {
    const head = await Head.create({ url: "mock://localhost:4001" });
    const provider = new HydraMeshProvider({
      head,
      httpUrl: "http://localhost:4001",
    });

    expect(() => provider.fetchBlockInfo("hash")).toThrow(
      "not supported on Hydra L2",
    );
    await head.dispose();
  });

  it("fetchTxInfo throws not-supported error", async () => {
    const head = await Head.create({ url: "mock://localhost:4001" });
    const provider = new HydraMeshProvider({
      head,
      httpUrl: "http://localhost:4001",
    });

    expect(() => provider.fetchTxInfo("hash")).toThrow(
      "not supported on Hydra L2",
    );
    await head.dispose();
  });

  it("fetchAssetAddresses throws not-supported error", async () => {
    const head = await Head.create({ url: "mock://localhost:4001" });
    const provider = new HydraMeshProvider({
      head,
      httpUrl: "http://localhost:4001",
    });

    expect(() => provider.fetchAssetAddresses("unit")).toThrow(
      "not supported on Hydra L2",
    );
    await head.dispose();
  });

  it("fetchAssetMetadata throws not-supported error", async () => {
    const head = await Head.create({ url: "mock://localhost:4001" });
    const provider = new HydraMeshProvider({
      head,
      httpUrl: "http://localhost:4001",
    });

    expect(() => provider.fetchAssetMetadata("unit")).toThrow(
      "not supported on Hydra L2",
    );
    await head.dispose();
  });

  it("fetchCollectionAssets throws not-supported error", async () => {
    const head = await Head.create({ url: "mock://localhost:4001" });
    const provider = new HydraMeshProvider({
      head,
      httpUrl: "http://localhost:4001",
    });

    expect(() => provider.fetchCollectionAssets("policyId")).toThrow(
      "not supported on Hydra L2",
    );
    await head.dispose();
  });

  it("fetchGovernanceProposal throws not-supported error", async () => {
    const head = await Head.create({ url: "mock://localhost:4001" });
    const provider = new HydraMeshProvider({
      head,
      httpUrl: "http://localhost:4001",
    });

    expect(() => provider.fetchGovernanceProposal("txHash", 0)).toThrow(
      "not supported on Hydra L2",
    );
    await head.dispose();
  });

  it("evaluateTx throws not-supported error", async () => {
    const head = await Head.create({ url: "mock://localhost:4001" });
    const provider = new HydraMeshProvider({
      head,
      httpUrl: "http://localhost:4001",
    });

    expect(() => provider.evaluateTx("cborHex")).toThrow(
      "not supported on Hydra L2",
    );
    await head.dispose();
  });

  it("get throws not-supported error", async () => {
    const head = await Head.create({ url: "mock://localhost:4001" });
    const provider = new HydraMeshProvider({
      head,
      httpUrl: "http://localhost:4001",
    });

    expect(() => provider.get("http://example.com")).toThrow(
      "not supported on Hydra L2",
    );
    await head.dispose();
  });

  // ---------------------------------------------------------------------------
  // submitTx
  // ---------------------------------------------------------------------------

  it("submitTx sends NewTx and returns tx hash", async () => {
    const head = await Head.create({ url: "mock://localhost:4001" });

    // Move head to Open state: Init → Commit → Open
    await head.init();
    await head.commit({});

    const provider = new HydraMeshProvider({
      head,
      httpUrl: "http://localhost:4001",
    });

    // Minimal valid Conway-era transaction CBOR hex
    const txCborHex =
      "84a400d90102818258200000000000000000000000000000000000000000000000000000000000000000000181a200583900000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001821a001e8480a0021a00028a00031a00000000a0f5f6";

    const txHash = await provider.submitTx(txCborHex);
    expect(txHash).toBeDefined();
    expect(typeof txHash).toBe("string");
    expect(txHash).toHaveLength(64);

    await head.dispose();
  });

  // ---------------------------------------------------------------------------
  // Provider swap pattern
  // ---------------------------------------------------------------------------

  it("can be used as IFetcher + ISubmitter (swap pattern)", async () => {
    const head = await Head.create({ url: "mock://localhost:4001" });
    const provider = new HydraMeshProvider({
      head,
      httpUrl: "http://localhost:4001",
    });

    // A generic function that accepts MeshJS interfaces
    const useProvider = (fetcher: IFetcher, submitter: ISubmitter) => {
      expect(typeof fetcher.fetchAddressUTxOs).toBe("function");
      expect(typeof submitter.submitTx).toBe("function");
    };

    // HydraMeshProvider satisfies both
    useProvider(provider, provider);

    await head.dispose();
  });
});

// ---------------------------------------------------------------------------
// mesh-utxo converter tests
// ---------------------------------------------------------------------------

describe("Provider / mesh-utxo conversion", () => {
  const {
    fromHydraMeshUtxo,
    fromHydraMeshUtxoMap,
    toHydraMeshUtxo,
    toHydraMeshUtxoMap,
  } = Provider;

  const TX_HASH =
    "aabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccdd";

  const ADDR =
    "addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp";

  it("fromHydraMeshUtxo converts lovelace-only UTxO", () => {
    const utxo = fromHydraMeshUtxo(`${TX_HASH}#0`, {
      address: ADDR,
      value: { lovelace: 5_000_000 },
    });

    expect(utxo.input.txHash).toBe(TX_HASH);
    expect(utxo.input.outputIndex).toBe(0);
    expect(utxo.output.address).toBe(ADDR);
    expect(utxo.output.amount).toContainEqual({
      unit: "lovelace",
      quantity: "5000000",
    });
  });

  it("fromHydraMeshUtxo converts multi-asset UTxO", () => {
    const policyId =
      "aabb00000000000000000000000000000000000000000000000000cc";
    const assetName = "546f6b656e41";

    const utxo = fromHydraMeshUtxo(`${TX_HASH}#1`, {
      address: ADDR,
      value: {
        lovelace: 2_000_000,
        [policyId]: { [assetName]: 100 },
      } as import("../../src/Protocol/Types.js").TxOut["value"],
    });

    expect(utxo.output.amount).toContainEqual({
      unit: "lovelace",
      quantity: "2000000",
    });
    expect(utxo.output.amount).toContainEqual({
      unit: `${policyId}${assetName}`,
      quantity: "100",
    });
  });

  it("fromHydraMeshUtxo preserves datum hash", () => {
    const datumHash =
      "1111111111111111111111111111111111111111111111111111111111111111";
    const utxo = fromHydraMeshUtxo(`${TX_HASH}#0`, {
      address: ADDR,
      value: { lovelace: 1_000_000 },
      datumHash,
    });

    expect(utxo.output.dataHash).toBe(datumHash);
  });

  it("fromHydraMeshUtxo preserves inline datum", () => {
    const inlineDatumRaw = "d87980";
    const utxo = fromHydraMeshUtxo(`${TX_HASH}#0`, {
      address: ADDR,
      value: { lovelace: 1_000_000 },
      inlineDatumRaw,
    });

    expect(utxo.output.plutusData).toBe(inlineDatumRaw);
  });

  it("fromHydraMeshUtxoMap converts multiple UTxOs", () => {
    const utxos = fromHydraMeshUtxoMap({
      [`${TX_HASH}#0`]: { address: ADDR, value: { lovelace: 1_000_000 } },
      [`${TX_HASH}#1`]: { address: ADDR, value: { lovelace: 2_000_000 } },
    });

    expect(utxos).toHaveLength(2);
    expect(utxos[0].input.outputIndex).not.toBe(utxos[1].input.outputIndex);
  });

  it("toHydraMeshUtxo round-trips a lovelace-only UTxO", () => {
    const original = fromHydraMeshUtxo(`${TX_HASH}#0`, {
      address: ADDR,
      value: { lovelace: 5_000_000 },
    });

    const [key, txOut] = toHydraMeshUtxo(original);

    expect(key).toBe(`${TX_HASH}#0`);
    expect(txOut.address).toBe(ADDR);
    expect((txOut.value as Record<string, unknown>).lovelace).toBe(5_000_000);
  });

  it("toHydraMeshUtxoMap converts array back to record", () => {
    const utxos = fromHydraMeshUtxoMap({
      [`${TX_HASH}#0`]: { address: ADDR, value: { lovelace: 1_000_000 } },
      [`${TX_HASH}#1`]: { address: ADDR, value: { lovelace: 2_000_000 } },
    });

    const map = toHydraMeshUtxoMap(utxos);

    expect(Object.keys(map)).toHaveLength(2);
    expect(map[`${TX_HASH}#0`]).toBeDefined();
    expect(map[`${TX_HASH}#1`]).toBeDefined();
  });
});
