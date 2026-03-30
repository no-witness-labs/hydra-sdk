/**
 * Bidirectional converters between hydra-node UTxO wire format and
 * `@meshsdk/common` UTxO types.
 *
 * These converters enable MeshJS users to work with Hydra head UTxOs
 * using familiar MeshJS data shapes.
 */
import type { Asset, UTxO as MeshUTxO } from "@meshsdk/common";

import type { TxOut, Value } from "../Protocol/Types.js";

// ---------------------------------------------------------------------------
// Hydra → MeshJS
// ---------------------------------------------------------------------------

/**
 * Convert a single hydra-node UTxO entry into a MeshJS `UTxO`.
 *
 * @param key - The UTxO reference in `"txhash#index"` format.
 * @param txOut - The hydra-node `TxOut` value.
 */
export const fromHydraMeshUtxo = (key: string, txOut: TxOut): MeshUTxO => {
  const [txHash, indexStr] = key.split("#");
  return {
    input: { txHash, outputIndex: Number(indexStr) },
    output: {
      address: txOut.address,
      amount: hydraValueToMeshAssets(txOut.value),
      ...(txOut.datumHash ? { dataHash: txOut.datumHash } : {}),
      ...(txOut.inlineDatumRaw ? { plutusData: txOut.inlineDatumRaw } : {}),
      ...(txOut.referenceScript && typeof txOut.referenceScript === "string"
        ? { scriptRef: txOut.referenceScript }
        : {}),
    },
  };
};

/**
 * Convert an entire hydra-node UTxO map into an array of MeshJS UTxOs.
 */
export const fromHydraMeshUtxoMap = (
  utxoMap: Record<string, TxOut>,
): MeshUTxO[] =>
  Object.entries(utxoMap).map(([key, txOut]) => fromHydraMeshUtxo(key, txOut));

// ---------------------------------------------------------------------------
// MeshJS → Hydra
// ---------------------------------------------------------------------------

/**
 * Convert a MeshJS `UTxO` into the hydra-node wire format.
 *
 * @returns A `[key, txOut]` tuple where `key` is `"txhash#index"`.
 */
export const toHydraMeshUtxo = (
  utxo: MeshUTxO,
): [string, Record<string, unknown>] => {
  const key = `${utxo.input.txHash}#${utxo.input.outputIndex}`;

  const value: Record<string, unknown> = { lovelace: 0 };
  for (const asset of utxo.output.amount) {
    if (asset.unit === "lovelace") {
      value.lovelace = Number(asset.quantity);
    } else {
      // unit = policyId (56 hex chars) + assetName (remaining hex)
      const policyId = asset.unit.slice(0, 56);
      const assetName = asset.unit.slice(56);
      if (!value[policyId]) value[policyId] = {};
      (value[policyId] as Record<string, number>)[assetName] = Number(
        asset.quantity,
      );
    }
  }

  const txOut: Record<string, unknown> = {
    address: utxo.output.address,
    datum: null,
    inlineDatum: null,
    inlineDatumRaw: utxo.output.plutusData ?? null,
    inlineDatumhash: utxo.output.dataHash ?? null,
    referenceScript: utxo.output.scriptRef ?? null,
    value,
  };

  return [key, txOut];
};

/**
 * Convert an array of MeshJS UTxOs into a hydra-node UTxO map.
 */
export const toHydraMeshUtxoMap = (
  utxos: ReadonlyArray<MeshUTxO>,
): Record<string, Record<string, unknown>> => {
  const map: Record<string, Record<string, unknown>> = {};
  for (const u of utxos) {
    const [key, txOut] = toHydraMeshUtxo(u);
    map[key] = txOut;
  }
  return map;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Convert hydra-node Value to MeshJS Asset array. */
const hydraValueToMeshAssets = (value: Value): Asset[] => {
  const assets: Asset[] = [];

  if (value.lovelace !== undefined) {
    assets.push({ unit: "lovelace", quantity: String(value.lovelace) });
  }

  for (const [policyId, tokenMap] of Object.entries(value)) {
    if (policyId === "lovelace") continue;
    if (typeof tokenMap !== "object" || tokenMap === null) continue;

    for (const [assetName, quantity] of Object.entries(
      tokenMap as Record<string, number>,
    )) {
      assets.push({
        unit: `${policyId}${assetName}`,
        quantity: String(quantity),
      });
    }
  }

  return assets;
};
