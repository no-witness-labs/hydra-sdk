/**
 * This module provides `HydraMeshProvider`, a `@meshsdk/common` provider
 * implementation that targets a Hydra L2 head instead of a Cardano L1 node.
 *
 * It implements the MeshJS `IFetcher`, `ISubmitter`, `IEvaluator`, and
 * `IListener` interfaces so MeshJS users can seamlessly build and submit
 * transactions against an open Hydra head.
 */
import type {
  AccountInfo,
  Action,
  Asset,
  AssetMetadata,
  BlockInfo,
  GovernanceProposalInfo,
  IEvaluator,
  IFetcher,
  IFetcherOptions,
  IListener,
  ISubmitter,
  Protocol,
  TransactionInfo,
  UTxO as MeshUTxO,
} from "@meshsdk/common";
import { blake2b } from "@noble/hashes/blake2b";
import { Effect } from "effect";

import type { HydraHead } from "../Head/Head.js";
import type { TxOut } from "../Protocol/Types.js";
import {
  getProtocolParameters,
  getSnapshotUtxo,
} from "./http.js";
import { fromHydraMeshUtxoMap } from "./mesh-utxo.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fetches the full UTxO snapshot from hydra-node and converts to MeshJS shape. */
const getAllMeshUtxos = (httpUrl: string): Promise<MeshUTxO[]> =>
  Effect.runPromise(
    getSnapshotUtxo(httpUrl).pipe(
      Effect.map((utxoMap) =>
        fromHydraMeshUtxoMap(utxoMap as Record<string, TxOut>),
      ),
    ),
  );

const notSupported = (method: string): never => {
  throw new Error(
    `${method} is not supported on Hydra L2. Hydra heads do not expose this L1-only functionality.`,
  );
};

// ---------------------------------------------------------------------------
// HydraMeshProvider
// ---------------------------------------------------------------------------

/**
 * Configuration for constructing a `HydraMeshProvider`.
 *
 * @category Models
 */
export interface HydraMeshProviderConfig {
  /** A connected `HydraHead` instance (for submitting transactions via WS). */
  readonly head: HydraHead;
  /**
   * HTTP base URL of the hydra-node API (e.g. `"http://localhost:4001"`).
   */
  readonly httpUrl: string;
}

/**
 * `HydraMeshProvider` is a MeshJS-compatible provider that targets a Hydra L2
 * head instead of a Cardano L1 node.
 *
 * It implements `IFetcher`, `ISubmitter`, `IEvaluator`, and `IListener` from
 * `@meshsdk/common`, allowing MeshJS transaction builders and wallets to work
 * seamlessly with an open Hydra head.
 *
 * - **Reads** (UTxOs, protocol parameters) are served from the hydra-node HTTP
 *   API snapshot.
 * - **Writes** (submitting transactions) are routed through the `HydraHead`
 *   WebSocket.
 * - **L1-only methods** (account info, block info, asset metadata, etc.) throw
 *   descriptive errors.
 *
 * @category Models
 *
 * @example
 * ```ts
 * import { Head } from "@no-witness-labs/hydra-sdk";
 * import { HydraMeshProvider } from "@no-witness-labs/hydra-sdk/mesh-provider";
 *
 * const head = await Head.create({ url: "ws://localhost:4001" });
 * const provider = new HydraMeshProvider({ head, httpUrl: "http://localhost:4001" });
 *
 * // Use with MeshJS transaction builder
 * const utxos = await provider.fetchAddressUTxOs("addr_test1...");
 * const txHash = await provider.submitTx(signedTxCborHex);
 * ```
 */
export class HydraMeshProvider
  implements IFetcher, ISubmitter, IEvaluator, IListener
{
  private readonly httpUrl: string;
  private readonly head: HydraHead;

  constructor(config: HydraMeshProviderConfig) {
    this.head = config.head;
    this.httpUrl = config.httpUrl;
  }

  // -------------------------------------------------------------------------
  // IFetcher
  // -------------------------------------------------------------------------

  /**
   * Fetches UTxOs at the given address from the L2 snapshot.
   * Optionally filters by asset unit.
   */
  async fetchAddressUTxOs(address: string, asset?: string): Promise<MeshUTxO[]> {
    const all = await getAllMeshUtxos(this.httpUrl);
    let filtered = all.filter((u) => u.output.address === address);
    if (asset) {
      filtered = filtered.filter((u) =>
        u.output.amount.some((a) => a.unit === asset),
      );
    }
    return filtered;
  }

  /**
   * Fetches UTxOs by transaction hash (and optional output index) from the L2 snapshot.
   */
  async fetchUTxOs(hash: string, index?: number): Promise<MeshUTxO[]> {
    const all = await getAllMeshUtxos(this.httpUrl);
    return all.filter(
      (u) =>
        u.input.txHash === hash &&
        (index === undefined || u.input.outputIndex === index),
    );
  }

  /**
   * Fetches protocol parameters from the hydra-node and normalizes to MeshJS `Protocol` shape.
   */
  async fetchProtocolParameters(_epoch: number): Promise<Protocol> {
    const pp = await Effect.runPromise(getProtocolParameters(this.httpUrl));
    const raw = pp as Record<string, unknown>;
    const execUnits = pp.maxTxExecutionUnits as Record<string, unknown>;
    const execPrices = pp.executionUnitPrices as Record<string, unknown> | undefined;

    return {
      epoch: _epoch,
      minFeeA: pp.txFeePerByte,
      minFeeB: Number(raw.txFeeFixed ?? 0),
      maxBlockSize: (raw.maxBlockBodySize as number) ?? 65536,
      maxTxSize: pp.maxTxSize,
      maxBlockHeaderSize: (raw.maxBlockHeaderSize as number) ?? 1100,
      keyDeposit: Number(raw.stakeAddressDeposit ?? 0),
      poolDeposit: Number(raw.stakePoolDeposit ?? 0),
      decentralisation: 0,
      minPoolCost: "0",
      priceMem: Number(execPrices?.priceMemory ?? 0),
      priceStep: Number(execPrices?.priceSteps ?? 0),
      maxTxExMem: String(execUnits.memory ?? 0),
      maxTxExSteps: String(execUnits.steps ?? execUnits.cpu ?? 0),
      maxBlockExMem: String(raw.maxBlockExecutionUnits
        ? (raw.maxBlockExecutionUnits as Record<string, unknown>).memory ?? 0
        : 0),
      maxBlockExSteps: String(raw.maxBlockExecutionUnits
        ? (raw.maxBlockExecutionUnits as Record<string, unknown>).steps ??
          (raw.maxBlockExecutionUnits as Record<string, unknown>).cpu ?? 0
        : 0),
      maxValSize: pp.maxValueSize ?? (raw.maxValueSize as number) ?? 5000,
      collateralPercent: pp.collateralPercentage,
      maxCollateralInputs: pp.maxCollateralInputs,
      coinsPerUtxoSize: Number(raw.utxoCostPerByte ?? raw.utxoConstPerByte ?? 0),
      minFeeRefScriptCostPerByte: 0,
    };
  }

  /** Not supported on Hydra L2. */
  fetchAccountInfo(_address: string): Promise<AccountInfo> {
    return notSupported("fetchAccountInfo");
  }

  /** Not supported on Hydra L2. */
  fetchAddressTxs(
    _address: string,
    _options?: IFetcherOptions,
  ): Promise<TransactionInfo[]> {
    return notSupported("fetchAddressTxs");
  }

  /** Not supported on Hydra L2. */
  fetchAssetAddresses(
    _asset: string,
  ): Promise<{ address: string; quantity: string }[]> {
    return notSupported("fetchAssetAddresses");
  }

  /** Not supported on Hydra L2. */
  fetchAssetMetadata(_asset: string): Promise<AssetMetadata> {
    return notSupported("fetchAssetMetadata");
  }

  /** Not supported on Hydra L2. */
  fetchBlockInfo(_hash: string): Promise<BlockInfo> {
    return notSupported("fetchBlockInfo");
  }

  /** Not supported on Hydra L2. */
  fetchCollectionAssets(
    _policyId: string,
    _cursor?: number | string,
  ): Promise<{ assets: Asset[]; next?: string | number | null }> {
    return notSupported("fetchCollectionAssets");
  }

  /** Not supported on Hydra L2. */
  fetchTxInfo(_hash: string): Promise<TransactionInfo> {
    return notSupported("fetchTxInfo");
  }

  /** Not supported on Hydra L2. */
  fetchGovernanceProposal(
    _txHash: string,
    _certIndex: number,
  ): Promise<GovernanceProposalInfo> {
    return notSupported("fetchGovernanceProposal");
  }

  /** Not supported on Hydra L2. */
  get(_url: string): Promise<unknown> {
    return notSupported("get");
  }

  // -------------------------------------------------------------------------
  // ISubmitter
  // -------------------------------------------------------------------------

  /**
   * Submits a signed transaction (CBOR hex) to the open Hydra Head via the
   * WebSocket `NewTx` command.
   *
   * @param tx - CBOR hex-encoded signed transaction.
   * @returns The transaction hash (blake2b-256 of the transaction body).
   */
  async submitTx(tx: string): Promise<string> {
    const txId = hashTransactionCbor(tx);

    await Effect.runPromise(
      this.head.effect.newTx({
        type: "Tx ConwayEra",
        description: "Ledger Cddl Format",
        cborHex: tx,
        txId,
      }),
    );

    return txId;
  }

  // -------------------------------------------------------------------------
  // IEvaluator
  // -------------------------------------------------------------------------

  /**
   * Not supported on Hydra L2. Hydra heads do not expose Plutus script
   * evaluation via the provider API.
   */
  evaluateTx(
    _tx: string,
    _additionalUtxos?: MeshUTxO[],
    _additionalTxs?: string[],
  ): Promise<Omit<Action, "data">[]> {
    return notSupported("evaluateTx");
  }

  // -------------------------------------------------------------------------
  // IListener
  // -------------------------------------------------------------------------

  /**
   * Subscribes to head events and invokes the callback when the given
   * transaction is confirmed (TxValid).
   *
   * @param txHash - Transaction hash to listen for.
   * @param callback - Called when the transaction is confirmed.
   * @param limit - Max number of events to check before giving up (default: 100).
   */
  onTxConfirmed(
    txHash: string,
    callback: () => void,
    limit?: number,
  ): void {
    let count = 0;
    const maxEvents = limit ?? 100;

    const unsubscribe = this.head.subscribe((event) => {
      count++;
      if (event.tag === "TxValid") {
        const payload = event.payload as
          | { transactionId?: string }
          | undefined;
        if (payload?.transactionId === txHash) {
          unsubscribe();
          callback();
          return;
        }
      }
      if (count >= maxEvents) {
        unsubscribe();
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Compute transaction hash (blake2b-256) from a full transaction CBOR hex.
 *
 * A Cardano transaction is CBOR-encoded as a 4-element array:
 * `[body, witnesses, isValid, auxiliaryData]`.
 * The txId is blake2b-256 of the body bytes (first element).
 */
const hashTransactionCbor = (txCborHex: string): string => {
  // Decode the outer CBOR array to extract the body bytes.
  // The body is the first element of the top-level array.
  // Rather than pulling in a full CBOR decoder, we hash the raw body bytes.
  // A CBOR array starts with 0x84 (4-element definite array), followed by
  // the body as the first element. We need to extract just the body bytes.
  const txBytes = hexToBytes(txCborHex);

  // Simple CBOR extraction: skip the array header (0x84 = 1 byte),
  // then read the first element (the body). We use a minimal CBOR
  // length reader to determine where the body ends.
  const bodyBytes = extractFirstCborElement(txBytes, 1);
  const digest = blake2b(bodyBytes, { dkLen: 32 });
  return bytesToHex(digest);
};

const hexToBytes = (hex: string): Uint8Array => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
};

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

/**
 * Extract the first CBOR data item starting at `offset` in `data`.
 * Returns the raw bytes of that item (including its header).
 */
const extractFirstCborElement = (
  data: Uint8Array,
  offset: number,
): Uint8Array => {
  const start = offset;
  const end = skipCborItem(data, offset);
  return data.subarray(start, end);
};

/**
 * Skip over one CBOR data item, returning the offset just past it.
 * Handles major types 0-5 and tag (6). Sufficient for transaction parsing.
 */
const skipCborItem = (data: Uint8Array, offset: number): number => {
  const initial = data[offset];
  const major = initial >> 5;
  const additional = initial & 0x1f;

  // Read the argument value and advance past the header
  let argLen: number;
  let value: number;
  if (additional < 24) {
    value = additional;
    argLen = 1;
  } else if (additional === 24) {
    value = data[offset + 1];
    argLen = 2;
  } else if (additional === 25) {
    value = (data[offset + 1] << 8) | data[offset + 2];
    argLen = 3;
  } else if (additional === 26) {
    value =
      (data[offset + 1] << 24) |
      (data[offset + 2] << 16) |
      (data[offset + 3] << 8) |
      data[offset + 4];
    argLen = 5;
  } else if (additional === 27) {
    // 8-byte integer — for our purposes, the lower 4 bytes suffice
    value =
      (data[offset + 5] << 24) |
      (data[offset + 6] << 16) |
      (data[offset + 7] << 8) |
      data[offset + 8];
    argLen = 9;
  } else {
    // Indefinite length or reserved — skip 1 byte as best-effort
    return offset + 1;
  }

  const headerEnd = offset + argLen;

  switch (major) {
    case 0: // unsigned int
    case 1: // negative int
    case 7: // simple/float
      return headerEnd;
    case 2: // byte string
    case 3: // text string
      return headerEnd + value;
    case 4: { // array
      let pos = headerEnd;
      for (let i = 0; i < value; i++) {
        pos = skipCborItem(data, pos);
      }
      return pos;
    }
    case 5: { // map
      let pos = headerEnd;
      for (let i = 0; i < value; i++) {
        pos = skipCborItem(data, pos); // key
        pos = skipCborItem(data, pos); // value
      }
      return pos;
    }
    case 6: // tag
      return skipCborItem(data, headerEnd);
    default:
      return headerEnd;
  }
};
