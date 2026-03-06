import { Address, Assets, DatumOption, TransactionHash } from "@evolution-sdk/evolution";
import { Provider } from "@no-witness-labs/hydra-sdk";
import { describe, expect, it } from "vitest";

import type { TxOut } from "../../src/Protocol/Types.js";

const { fromHydraUtxo, fromHydraUtxoMap, toHydraUtxo, toHydraUtxoMap } =
  Provider;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TX_HASH =
  "aabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccdd";

const ADDR_BECH32 =
  "addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp";

const mkLovelaceTxOut = (lovelace: number): TxOut => ({
  address: ADDR_BECH32,
  value: { lovelace },
});

const mkMultiAssetTxOut = (): TxOut => ({
  address: ADDR_BECH32,
  value: {
    lovelace: 2_000_000,
    aabb00000000000000000000000000000000000000000000000000cc: {
      "546f6b656e41": 100,
    },
  } as TxOut["value"],
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Provider / utxo conversion", () => {
  describe("fromHydraUtxo", () => {
    it("parses a lovelace-only UTxO", () => {
      const utxo = fromHydraUtxo(`${TX_HASH}#0`, mkLovelaceTxOut(5_000_000));

      expect(TransactionHash.toHex(utxo.transactionId)).toBe(TX_HASH);
      expect(utxo.index).toBe(0n);
      expect(Address.toBech32(utxo.address)).toBe(ADDR_BECH32);
      expect(Assets.lovelaceOf(utxo.assets)).toBe(5_000_000n);
    });

    it("parses a multi-asset UTxO", () => {
      const utxo = fromHydraUtxo(`${TX_HASH}#1`, mkMultiAssetTxOut());
      expect(utxo.index).toBe(1n);
      expect(Assets.lovelaceOf(utxo.assets)).toBe(2_000_000n);

      const unit =
        "aabb00000000000000000000000000000000000000000000000000cc546f6b656e41";
      expect(Assets.getByUnit(utxo.assets, unit)).toBe(100n);
    });

    it("parses inline datum from inlineDatumRaw", () => {
      const txOut: TxOut = {
        ...mkLovelaceTxOut(1_000_000),
        inlineDatumRaw: "01", // CBOR integer 1
      };
      const utxo = fromHydraUtxo(`${TX_HASH}#0`, txOut);
      expect(utxo.datumOption).toBeDefined();
      expect(DatumOption.isInlineDatum(utxo.datumOption!)).toBe(true);
    });

    it("parses datumHash", () => {
      const hash =
        "1111111111111111111111111111111111111111111111111111111111111111";
      const txOut: TxOut = {
        ...mkLovelaceTxOut(1_000_000),
        datumHash: hash,
      };
      const utxo = fromHydraUtxo(`${TX_HASH}#0`, txOut);
      expect(utxo.datumOption).toBeDefined();
      expect(DatumOption.isDatumHash(utxo.datumOption!)).toBe(true);
    });
  });

  describe("fromHydraUtxoMap", () => {
    it("converts multiple entries", () => {
      const map: Record<string, TxOut> = {
        [`${TX_HASH}#0`]: mkLovelaceTxOut(1_000_000),
        [`${TX_HASH}#1`]: mkLovelaceTxOut(2_000_000),
      };
      const utxos = fromHydraUtxoMap(map);
      expect(utxos).toHaveLength(2);
    });
  });

  describe("toHydraUtxo round-trip", () => {
    it("round-trips a lovelace-only UTxO", () => {
      const original = fromHydraUtxo(
        `${TX_HASH}#0`,
        mkLovelaceTxOut(5_000_000),
      );
      const [key, txOut] = toHydraUtxo(original);

      expect(key).toBe(`${TX_HASH}#0`);
      expect(txOut.address).toBe(ADDR_BECH32);
      expect((txOut.value as Record<string, unknown>).lovelace).toBe(5_000_000);
    });

    it("round-trips a multi-asset UTxO", () => {
      const original = fromHydraUtxo(`${TX_HASH}#1`, mkMultiAssetTxOut());
      const [key, txOut] = toHydraUtxo(original);

      expect(key).toBe(`${TX_HASH}#1`);
      const value = txOut.value as Record<string, unknown>;
      expect(value.lovelace).toBe(2_000_000);

      const policyTokens = value[
        "aabb00000000000000000000000000000000000000000000000000cc"
      ] as Record<string, number>;
      expect(policyTokens["546f6b656e41"]).toBe(100);
    });
  });

  describe("toHydraUtxoMap", () => {
    it("converts an array of UTxOs to a map", () => {
      const utxos = fromHydraUtxoMap({
        [`${TX_HASH}#0`]: mkLovelaceTxOut(1_000_000),
        [`${TX_HASH}#1`]: mkLovelaceTxOut(2_000_000),
      });
      const map = toHydraUtxoMap(utxos);
      expect(Object.keys(map)).toHaveLength(2);
      expect(map[`${TX_HASH}#0`]).toBeDefined();
      expect(map[`${TX_HASH}#1`]).toBeDefined();
    });
  });
});
