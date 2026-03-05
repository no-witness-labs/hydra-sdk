/**
 * Bidirectional converters between hydra-node UTxO wire format and
 * `@evolution-sdk/evolution` `UTxO.UTxO`.
 */
import type { InlineDatum } from "@evolution-sdk/evolution";
import {
  Address,
  AssetName,
  Assets,
  Data,
  DatumHash,
  DatumOption,
  InlineDatum as InlineDatumMod,
  PolicyId,
  Script,
  TransactionHash,
  UTxO,
} from "@evolution-sdk/evolution";

import type { TxOut, Value } from "../Protocol/Types.js";

// ---------------------------------------------------------------------------
// Hydra → evolution-sdk
// ---------------------------------------------------------------------------

/**
 * Convert a single hydra-node UTxO entry into an evolution-sdk `UTxO.UTxO`.
 *
 * @param key - The UTxO reference in `"txhash#index"` format.
 * @param txOut - The hydra-node `TxOut` value.
 */
export const fromHydraUtxo = (key: string, txOut: TxOut): UTxO.UTxO => {
  const [txHashHex, indexStr] = key.split("#");
  const transactionId = TransactionHash.fromHex(txHashHex);
  const index = BigInt(indexStr);
  const address = Address.fromBech32(txOut.address);
  const assets = hydraValueToAssets(txOut.value);

  let datumOption: DatumOption.DatumOption | undefined;
  if (txOut.inlineDatumRaw) {
    const data = Data.fromCBORHex(txOut.inlineDatumRaw);
    datumOption = new InlineDatumMod.InlineDatum({ data });
  } else if (txOut.datumHash) {
    datumOption = DatumHash.fromHex(txOut.datumHash);
  }

  let scriptRef: Script.Script | undefined;
  if (txOut.referenceScript && typeof txOut.referenceScript === "string") {
    scriptRef = Script.fromCBORHex(txOut.referenceScript);
  }

  return new UTxO.UTxO({
    transactionId,
    index,
    address,
    assets,
    ...(datumOption !== undefined && { datumOption }),
    ...(scriptRef !== undefined && { scriptRef }),
  });
};

/**
 * Convert an entire hydra-node UTxO map into an array of evolution-sdk UTxOs.
 */
export const fromHydraUtxoMap = (
  utxoMap: Record<string, TxOut>,
): Array<UTxO.UTxO> =>
  Object.entries(utxoMap).map(([key, txOut]) => fromHydraUtxo(key, txOut));

// ---------------------------------------------------------------------------
// evolution-sdk → Hydra
// ---------------------------------------------------------------------------

/**
 * Convert an evolution-sdk `UTxO.UTxO` into the hydra-node wire format.
 *
 * @returns A `[key, txOut]` tuple where `key` is `"txhash#index"`.
 */
export const toHydraUtxo = (
  utxo: UTxO.UTxO,
): [string, Record<string, unknown>] => {
  const txHash = TransactionHash.toHex(utxo.transactionId);
  const key = `${txHash}#${utxo.index}`;
  const bech32Addr = Address.toBech32(utxo.address);

  const lovelace = Assets.lovelaceOf(utxo.assets);
  const value: Record<string, unknown> = { lovelace: Number(lovelace) };
  for (const [pid, name, qty] of Assets.flatten(utxo.assets)) {
    const pidHex = PolicyId.toHex(pid);
    const nameHex = AssetName.toHex(name);
    if (!value[pidHex]) value[pidHex] = {};
    (value[pidHex] as Record<string, number>)[nameHex] = Number(qty);
  }

  let datumHash: string | null = null;
  let inlineDatumCbor: string | null = null;
  if (utxo.datumOption) {
    if (DatumOption.isDatumHash(utxo.datumOption)) {
      datumHash = DatumHash.toHex(utxo.datumOption as DatumHash.DatumHash);
    } else if (DatumOption.isInlineDatum(utxo.datumOption)) {
      inlineDatumCbor = Data.toCBORHex(
        (utxo.datumOption as InlineDatum.InlineDatum).data,
      );
    }
  }

  const txOut: Record<string, unknown> = {
    address: bech32Addr,
    datum: null,
    inlineDatum: null,
    inlineDatumRaw: inlineDatumCbor,
    inlineDatumhash: datumHash,
    referenceScript: utxo.scriptRef ? Script.toCBORHex(utxo.scriptRef) : null,
    value,
  };

  return [key, txOut];
};

/**
 * Convert an array of evolution-sdk UTxOs into a hydra-node UTxO map.
 */
export const toHydraUtxoMap = (
  utxos: ReadonlyArray<UTxO.UTxO>,
): Record<string, Record<string, unknown>> => {
  const map: Record<string, Record<string, unknown>> = {};
  for (const u of utxos) {
    const [key, txOut] = toHydraUtxo(u);
    map[key] = txOut;
  }
  return map;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const hydraValueToAssets = (value: Value): Assets.Assets => {
  let assets = Assets.fromLovelace(BigInt(value.lovelace));

  for (const [policyIdHex, tokenMap] of Object.entries(value)) {
    if (policyIdHex === "lovelace") continue;
    if (typeof tokenMap !== "object" || tokenMap === null) continue;

    for (const [assetNameHex, quantity] of Object.entries(
      tokenMap as Record<string, number>,
    )) {
      assets = Assets.addByHex(
        assets,
        policyIdHex,
        assetNameHex,
        BigInt(quantity),
      );
    }
  }

  return assets;
};
