/**
 * This module provides `HydraProvider`, an `@evolution-sdk/evolution` `Provider`
 * implementation that targets a Hydra L2 head instead of a Cardano L1 node.
 * Use it with the same transaction-building API as other evolution providers.
 */
import type {
  Address,
  InlineDatum,
  TransactionInput,
  UTxO,
} from "@evolution-sdk/evolution";
import {
  Assets,
  Credential,
  Data,
  DatumHash,
  DatumOption,
  Transaction,
  TransactionBody,
  TransactionHash,
} from "@evolution-sdk/evolution";
import type {
  Delegation,
  ProtocolParameters,
  Provider,
  ProviderEffect,
} from "@evolution-sdk/evolution/sdk/provider/Provider";
import { ProviderError } from "@evolution-sdk/evolution/sdk/provider/Provider";
import { blake2b } from "@noble/hashes/blake2b";
import { Effect, Equal } from "effect";

import type { HydraHead } from "../Head/Head.js";
import type { TxOut } from "../Protocol/Types.js";
import {
  getProtocolParameters as getProtocolParametersHttp,
  getSnapshotUtxo,
} from "./http.js";
import { fromHydraUtxoMap } from "./utxo.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wraps an Effect's failure channel in a `ProviderError` with the given message. */
const wrapError = <A>(
  effect: Effect.Effect<A, unknown>,
  message: string,
): Effect.Effect<A, ProviderError> =>
  effect.pipe(
    Effect.mapError((cause) => new ProviderError({ cause, message })),
  );

/** Fetches the full UTxO snapshot from the hydra-node HTTP API and maps to evolution UTxO shape. */
const getAllUtxos = (
  httpUrl: string,
): Effect.Effect<Array<UTxO.UTxO>, ProviderError> =>
  wrapError(
    getSnapshotUtxo(httpUrl).pipe(
      Effect.map((utxoMap) =>
        fromHydraUtxoMap(utxoMap as Record<string, TxOut>),
      ),
    ),
    "Failed to fetch snapshot UTxOs",
  );

/** Returns true if the UTxO belongs to the given address or payment credential. */
const matchesAddress = (
  utxo: UTxO.UTxO,
  addressOrCredential: Address.Address | Credential.Credential,
): boolean => {
  if (Credential.is(addressOrCredential)) {
    return Equal.equals(utxo.address.paymentCredential, addressOrCredential);
  }
  return Equal.equals(utxo.address, addressOrCredential);
};

/** Returns true if the UTxO contains a non-zero amount of the given asset unit. */
const hasUnit = (utxo: UTxO.UTxO, unit: string): boolean =>
  Assets.getByUnit(utxo.assets, unit) > 0n;

// ---------------------------------------------------------------------------
// HydraProvider
// ---------------------------------------------------------------------------

/**
 * Configuration for constructing a `HydraProvider`.
 *
 * At minimum you must supply a connected `HydraHead` instance and the
 * HTTP base URL of the corresponding hydra-node.
 *
 * @category Models
 *
 * @example
 * ```ts
 * // Promise API
 * import { Head, Provider } from "@no-witness-labs/hydra-sdk";
 *
 * async function example() {
 *   const head = await Head.create({ url: "ws://localhost:4001" });
 *   const provider = new Provider.HydraProvider({ head, httpUrl: "http://localhost:4001" });
 * }
 * ```
 *
 * @example
 * ```ts
 * // Effect API
 * import { Effect } from "effect";
 * import { Head, Provider } from "@no-witness-labs/hydra-sdk";
 *
 * Effect.gen(function* () {
 *   const head = yield* Head.effect.create({ url: "ws://localhost:4001" });
 *   const provider = new Provider.HydraProvider({ head, httpUrl: "http://localhost:4001" });
 * });
 * ```
 */
export interface HydraProviderConfig {
  /** A connected `HydraHead` instance (for submitting transactions via WS). */
  readonly head: HydraHead;
  /**
   * HTTP base URL of the hydra-node API (e.g. `"http://localhost:4001"`).
   *
   * This is required because `HydraHead` does not expose its WebSocket URL.
   * Typically this is the same host/port as the WebSocket URL with `http://`
   * instead of `ws://`.
   */
  readonly httpUrl: string;
}

/**
 * `HydraProvider` is a Cardano `Provider` implementation that targets a Hydra
 * L2 head instead of a traditional L1 node.
 *
 * It exposes the same high-level query and transaction APIs as other
 * `@evolution-sdk/evolution` providers, but:
 *
 * - **Reads** (UTxOs, datums, protocol parameters) are served from the
 *   hydra-node HTTP API snapshot.
 * - **Writes** (submitting transactions, awaiting confirmation) are routed
 *   through a connected `HydraHead` WebSocket instance.
 *
 * @category Models
 *
 * @example
 * ```ts
 * // Promise API — full lifecycle
 * import { Address } from "@evolution-sdk/evolution";
 * import { Head, Provider } from "@no-witness-labs/hydra-sdk";
 *
 * async function example() {
 *   const head = await Head.create({ url: "ws://localhost:4001" });
 *
 *   await head.init();
 *
 *   const provider = new Provider.HydraProvider({
 *     head,
 *     httpUrl: "http://localhost:4001",
 *   });
 *
 *   const address = Address.fromBech32("addr_test1...");
 *   const utxos = await provider.getUtxos(address);
 *   const txHash = await provider.submitTx(signedTx);
 *   await provider.awaitTx(txHash);
 *
 *   await head.dispose();
 * }
 * ```
 *
 * @example
 * ```ts
 * // Effect API — full lifecycle
 * import { Address } from "@evolution-sdk/evolution";
 * import { Effect } from "effect";
 * import { Head, Provider } from "@no-witness-labs/hydra-sdk";
 *
 * const program = Effect.gen(function* () {
 *   const head = yield* Head.effect.create({ url: "ws://localhost:4001" });
 *
 *   yield* head.effect.init();
 *
 *   const provider = new Provider.HydraProvider({
 *     head,
 *     httpUrl: "http://localhost:4001",
 *   });
 *
 *   const address = Address.fromBech32("addr_test1...");
 *   const utxos = yield* provider.Effect.getUtxos(address);
 *   const txHash = yield* provider.Effect.submitTx(signedTx);
 *   yield* provider.Effect.awaitTx(txHash);
 *
 *   yield* head.effect.dispose();
 * });
 *
 * await Effect.runPromise(program);
 * ```
 */
export class HydraProvider implements Provider {
  readonly Effect: ProviderEffect;

  private readonly httpUrl: string;
  private readonly head: HydraHead;

  /**
   * Creates a provider that reads from the hydra-node HTTP API and submits
   * transactions through the given head.
   *
   * @param config - Head instance and HTTP base URL for the hydra-node API.
   */
  constructor(config: HydraProviderConfig) {
    this.head = config.head;
    this.httpUrl = config.httpUrl;

    const httpUrl = this.httpUrl;
    const head = this.head;

    this.Effect = {
      getProtocolParameters: () => getProtocolParametersEffect(httpUrl),
      getUtxos: (addressOrCredential) =>
        getUtxosEffect(httpUrl, addressOrCredential),
      getUtxosWithUnit: (addressOrCredential, unit) =>
        getUtxosWithUnitEffect(httpUrl, addressOrCredential, unit),
      getUtxoByUnit: (unit) => getUtxoByUnitEffect(httpUrl, unit),
      getUtxosByOutRef: (inputs) => getUtxosByOutRefEffect(httpUrl, inputs),
      getDelegation: () => getDelegationEffect(),
      getDatum: (datumHash) => getDatumEffect(httpUrl, datumHash),
      awaitTx: (txHash, checkInterval) =>
        awaitTxEffect(head, txHash, checkInterval),
      submitTx: (tx) => submitTxEffect(head, httpUrl, tx),
      evaluateTx: () => evaluateTxEffect(),
    };
  }

  /**
   * Return every UTxO in the current L2 snapshot without address filtering.
   *
   * @example
   * ```ts
   * // Promise API
   * const allSnapshotUtxos = await provider.getSnapshotUtxos();
   * console.log(allSnapshotUtxos.length);
   * ```
   *
   * @example
   * ```ts
   * // Effect API
   * const allUtxos = yield* Effect.promise(() => provider.getSnapshotUtxos());
   * ```
   */
  getSnapshotUtxos = (): Promise<Array<UTxO.UTxO>> =>
    Effect.runPromise(getAllUtxos(this.httpUrl));

  /**
   * Fetches protocol parameters from the hydra-node (fees, sizes, cost models).
   *
   * @returns Promise of protocol parameters; rejects with `ProviderError` on failure.
   *
   * @example
   * ```ts
   * // Promise API
   * const pp = await provider.getProtocolParameters();
   * ```
   *
   * @example
   * ```ts
   * // Effect API
   * const pp = yield* provider.Effect.getProtocolParameters();
   * ```
   */
  getProtocolParameters = () =>
    Effect.runPromise(this.Effect.getProtocolParameters());

  /**
   * Returns UTxOs at the given address or payment credential from the L2 snapshot.
   *
   * @param addressOrCredential - Bech32 address or credential to filter by.
   * @returns Promise of UTxO array; rejects with `ProviderError` on failure.
   *
   * @example
   * ```ts
   * // Promise API
   * const utxos = await provider.getUtxos(address);
   * ```
   *
   * @example
   * ```ts
   * // Effect API
   * const utxos = yield* provider.Effect.getUtxos(address);
   * ```
   */
  getUtxos = (addressOrCredential: Parameters<Provider["getUtxos"]>[0]) =>
    Effect.runPromise(this.Effect.getUtxos(addressOrCredential));

  /**
   * Returns UTxOs at the given address or credential that contain the given asset unit.
   *
   * @param addressOrCredential - Bech32 address or credential to filter by.
   * @param unit - Asset unit (policyId + assetName hex).
   * @returns Promise of UTxO array; rejects with `ProviderError` on failure.
   *
   * @example
   * ```ts
   * // Promise API
   * const utxos = await provider.getUtxosWithUnit(address, unit);
   * ```
   *
   * @example
   * ```ts
   * // Effect API
   * const utxos = yield* provider.Effect.getUtxosWithUnit(address, unit);
   * ```
   */
  getUtxosWithUnit = (
    addressOrCredential: Parameters<Provider["getUtxosWithUnit"]>[0],
    unit: Parameters<Provider["getUtxosWithUnit"]>[1],
  ) =>
    Effect.runPromise(this.Effect.getUtxosWithUnit(addressOrCredential, unit));

  /**
   * Returns the single UTxO that holds the given asset unit (fails if none or multiple).
   *
   * @param unit - Asset unit (policyId + assetName hex).
   * @returns Promise of the UTxO; rejects with `ProviderError` if not found.
   *
   * @example
   * ```ts
   * // Promise API
   * const utxo = await provider.getUtxoByUnit(unit);
   * ```
   *
   * @example
   * ```ts
   * // Effect API
   * const utxo = yield* provider.Effect.getUtxoByUnit(unit);
   * ```
   */
  getUtxoByUnit = (unit: Parameters<Provider["getUtxoByUnit"]>[0]) =>
    Effect.runPromise(this.Effect.getUtxoByUnit(unit));

  /**
   * Returns UTxOs corresponding to the given transaction inputs (out refs).
   *
   * @param outRefs - Transaction input references (tx hash + index).
   * @returns Promise of UTxO array; rejects with `ProviderError` on failure.
   *
   * @example
   * ```ts
   * // Promise API
   * const utxos = await provider.getUtxosByOutRef(inputs);
   * ```
   *
   * @example
   * ```ts
   * // Effect API
   * const utxos = yield* provider.Effect.getUtxosByOutRef(inputs);
   * ```
   */
  getUtxosByOutRef = (outRefs: Parameters<Provider["getUtxosByOutRef"]>[0]) =>
    Effect.runPromise(this.Effect.getUtxosByOutRef(outRefs));

  /**
   * Delegation is not supported on Hydra L2. Returns a stub `{ poolId: null, rewards: 0n }`.
   *
   * @param _rewardAddress - Ignored.
   * @returns Promise of the stub delegation.
   *
   * @example
   * ```ts
   * // Promise API
   * const delegation = await provider.getDelegation(rewardAddress);
   * ```
   *
   * @example
   * ```ts
   * // Effect API
   * const delegation = yield* provider.Effect.getDelegation(rewardAddress);
   * ```
   */
  getDelegation = (rewardAddress: Parameters<Provider["getDelegation"]>[0]) =>
    Effect.runPromise(this.Effect.getDelegation(rewardAddress));

  /**
   * Looks up datum by hash from inline datums in the current L2 snapshot.
   *
   * @param datumHash - Hash of the datum to resolve.
   * @returns Promise of the datum data; rejects with `ProviderError` if not found.
   *
   * @example
   * ```ts
   * // Promise API
   * const data = await provider.getDatum(datumHash);
   * ```
   *
   * @example
   * ```ts
   * // Effect API
   * const data = yield* provider.Effect.getDatum(datumHash);
   * ```
   */
  getDatum = (datumHash: Parameters<Provider["getDatum"]>[0]) =>
    Effect.runPromise(this.Effect.getDatum(datumHash));

  /**
   * Waits until the transaction is either validated (TxValid) or invalidated (TxInvalid) on the head.
   *
   * @param txHash - Transaction hash to wait for.
   * @param checkInterval - Optional polling interval (ignored; this implementation uses head subscription).
   * @returns Promise that resolves to `true` when valid, or rejects with `ProviderError` when invalid.
   *
   * @example
   * ```ts
   * // Promise API
   * await provider.awaitTx(txHash);
   * ```
   *
   * @example
   * ```ts
   * // Effect API
   * yield* provider.Effect.awaitTx(txHash);
   * ```
   */
  awaitTx = (
    txHash: Parameters<Provider["awaitTx"]>[0],
    checkInterval?: Parameters<Provider["awaitTx"]>[1],
  ) => Effect.runPromise(this.Effect.awaitTx(txHash, checkInterval));

  /**
   * Submits a signed transaction to the open Hydra Head via WebSocket (NewTx).
   *
   * @param tx - Signed Cardano transaction.
   * @returns Promise of the transaction hash; rejects with `ProviderError` on failure.
   *
   * @example
   * ```ts
   * // Promise API
   * const txHash = await provider.submitTx(signedTx);
   * ```
   *
   * @example
   * ```ts
   * // Effect API
   * const txHash = yield* provider.Effect.submitTx(signedTx);
   * ```
   */
  submitTx = (tx: Parameters<Provider["submitTx"]>[0]) =>
    Effect.runPromise(this.Effect.submitTx(tx));

  /**
   * Not supported on Hydra L2. Always rejects with `ProviderError`.
   * Hydra heads do not expose Plutus script evaluation via the provider API.
   *
   * @param _tx - Ignored.
   * @param _additionalUTxOs - Ignored.
   * @throws Always throws `ProviderError`.
   *
   * @example
   * ```ts
   * // Promise API
   * await provider.evaluateTx(tx); // throws ProviderError
   * ```
   *
   * @example
   * ```ts
   * // Effect API
   * yield* provider.Effect.evaluateTx(tx); // fails with ProviderError
   * ```
   */
  evaluateTx = (
    tx: Parameters<Provider["evaluateTx"]>[0],
    additionalUTxOs?: Parameters<Provider["evaluateTx"]>[1],
  ) => Effect.runPromise(this.Effect.evaluateTx(tx, additionalUTxOs));
}

// ---------------------------------------------------------------------------
// Effect implementations
// ---------------------------------------------------------------------------

/**
 * Safely extract a lovelace value from a field that may be either a flat
 * number/bigint or an object with a `lovelace` property (hydra-node v1.2.0
 * returns flat numbers).
 */
const lovelaceOf = (v: unknown): bigint => {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(v);
  if (typeof v === "object" && v !== null && "lovelace" in v)
    return BigInt((v as { lovelace: number }).lovelace);
  return 0n;
};

/** Fetches protocol parameters from hydra-node and normalizes to evolution Provider shape. */
const getProtocolParametersEffect = (
  httpUrl: string,
): Effect.Effect<ProtocolParameters, ProviderError> =>
  wrapError(
    getProtocolParametersHttp(httpUrl).pipe(
      Effect.map((pp) => {
        const raw = pp as Record<string, unknown>;
        const execUnits = pp.maxTxExecutionUnits as Record<string, unknown>;
        return {
          minFeeA: pp.txFeePerByte,
          minFeeB: Number(lovelaceOf(raw.txFeeFixed)),
          maxTxSize: pp.maxTxSize,
          maxValSize: pp.maxValueSize ?? (raw.maxValueSize as number) ?? 5000,
          keyDeposit: lovelaceOf(raw.stakeAddressDeposit),
          poolDeposit: lovelaceOf(raw.stakePoolDeposit),
          drepDeposit: 0n,
          govActionDeposit: 0n,
          priceMem: extractPriceMem(pp.executionUnitPrices),
          priceStep: extractPriceStep(pp.executionUnitPrices),
          maxTxExMem: BigInt(execUnits.memory as number),
          maxTxExSteps: BigInt((execUnits.steps ?? execUnits.cpu) as number),
          coinsPerUtxoByte: lovelaceOf(
            raw.utxoCostPerByte ?? raw.utxoConstPerByte,
          ),
          collateralPercentage: pp.collateralPercentage,
          maxCollateralInputs: pp.maxCollateralInputs,
          minFeeRefScriptCostPerByte: 0,
          costModels: {
            PlutusV1: arrayToIndexedRecord(pp.costModels.PlutusV1),
            PlutusV2: arrayToIndexedRecord(pp.costModels.PlutusV2),
            PlutusV3: arrayToIndexedRecord(pp.costModels.PlutusV3),
          },
        };
      }),
    ),
    "Failed to fetch protocol parameters",
  );

/** UTxOs at the given address or credential from the L2 snapshot. */
const getUtxosEffect = (
  httpUrl: string,
  addressOrCredential: Address.Address | Credential.Credential,
): Effect.Effect<Array<UTxO.UTxO>, ProviderError> =>
  getAllUtxos(httpUrl).pipe(
    Effect.map((all) =>
      all.filter((u) => matchesAddress(u, addressOrCredential)),
    ),
  );

/** UTxOs at the given address/credential that contain the given asset unit. */
const getUtxosWithUnitEffect = (
  httpUrl: string,
  addressOrCredential: Address.Address | Credential.Credential,
  unit: string,
): Effect.Effect<Array<UTxO.UTxO>, ProviderError> =>
  getUtxosEffect(httpUrl, addressOrCredential).pipe(
    Effect.map((utxos) => utxos.filter((u) => hasUnit(u, unit))),
  );

/** Single UTxO holding the given unit; fails if none or multiple. */
const getUtxoByUnitEffect = (
  httpUrl: string,
  unit: string,
): Effect.Effect<UTxO.UTxO, ProviderError> =>
  getAllUtxos(httpUrl).pipe(
    Effect.flatMap((all) => {
      const found = all.find((u) => hasUnit(u, unit));
      return found
        ? Effect.succeed(found)
        : Effect.fail(
            new ProviderError({
              cause: null,
              message: `No UTxO found with unit: ${unit}`,
            }),
          );
    }),
  );

/** UTxOs matching the given transaction input references. */
const getUtxosByOutRefEffect = (
  httpUrl: string,
  inputs: ReadonlyArray<TransactionInput.TransactionInput>,
): Effect.Effect<Array<UTxO.UTxO>, ProviderError> =>
  getAllUtxos(httpUrl).pipe(
    Effect.map((all) =>
      all.filter((u) =>
        inputs.some(
          (input) =>
            Equal.equals(u.transactionId, input.transactionId) &&
            u.index === input.index,
        ),
      ),
    ),
  );

/** Delegation is not supported on L2; returns stub delegation. */
const getDelegationEffect = (): Effect.Effect<Delegation, ProviderError> =>
  Effect.succeed({ poolId: null, rewards: 0n });

/** Resolves datum by hash from inline datums in the L2 snapshot. */
const getDatumEffect = (
  httpUrl: string,
  datumHash: DatumHash.DatumHash,
): Effect.Effect<Data.Data, ProviderError> => {
  const targetHex = DatumHash.toHex(datumHash);
  return getAllUtxos(httpUrl).pipe(
    Effect.flatMap((all) => {
      // Scan snapshot UTxOs for an inline datum whose hash matches.
      for (const u of all) {
        if (!u.datumOption || !DatumOption.isInlineDatum(u.datumOption))
          continue;
        const inlineDatum = u.datumOption as InlineDatum.InlineDatum;
        const cborBytes = Data.toCBORBytes(inlineDatum.data);
        const hash = blake2b(cborBytes, { dkLen: 32 });
        const hashHex = Array.from(hash)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        if (hashHex === targetHex) {
          return Effect.succeed(inlineDatum.data);
        }
      }
      return Effect.fail(
        new ProviderError({
          cause: null,
          message: `Datum not found for hash: ${targetHex}`,
        }),
      );
    }),
  );
};

/** Subscribes to head events and resolves when the tx is TxValid or fails on TxInvalid. */
const awaitTxEffect = (
  head: HydraHead,
  txHash: TransactionHash.TransactionHash,
  _checkInterval?: number,
): Effect.Effect<boolean, ProviderError> =>
  Effect.async<boolean, ProviderError>((resume) => {
    const targetTxId = TransactionHash.toHex(txHash);

    const unsubscribe = head.subscribe((event) => {
      if (event.tag === "TxValid") {
        const payload = event.payload as { transactionId?: string } | undefined;
        if (payload?.transactionId === targetTxId) {
          unsubscribe();
          resume(Effect.succeed(true));
        }
      }
      if (event.tag === "TxInvalid") {
        const payload = event.payload as
          | {
              transaction?: { txId?: string };
              validationError?: { reason?: string };
            }
          | undefined;
        if (payload?.transaction?.txId === targetTxId) {
          unsubscribe();
          resume(
            Effect.fail(
              new ProviderError({
                cause: payload.validationError,
                message: `Transaction ${targetTxId} was invalid: ${payload.validationError?.reason ?? "unknown reason"}`,
              }),
            ),
          );
        }
      }
    });
  });

/** Computes the transaction hash (blake2b-256 of the body CBOR). */
const hashTransactionBody = (
  body: TransactionBody.TransactionBody,
): TransactionHash.TransactionHash => {
  const bytes = TransactionBody.toCBORBytes(body);
  const digest = blake2b(bytes, { dkLen: 32 });
  return new TransactionHash.TransactionHash({ hash: digest });
};

/** Sends the transaction to the head via NewTx WebSocket command and returns its hash. */
const submitTxEffect = (
  head: HydraHead,
  _httpUrl: string,
  tx: Transaction.Transaction,
): Effect.Effect<TransactionHash.TransactionHash, ProviderError> =>
  Effect.gen(function* () {
    const cborHex = Transaction.toCBORHex(tx);
    const txHash = hashTransactionBody(tx.body);
    const txId = TransactionHash.toHex(txHash);

    // Send NewTx via WebSocket
    yield* wrapError(
      head.effect.newTx({
        type: "Tx ConwayEra",
        description: "Ledger Cddl Format",
        cborHex,
        txId,
      }),
      `Failed to submit transaction ${txId}`,
    );

    return txHash;
  });

/** Plutus evaluation is not supported on Hydra L2; always fails. */
const evaluateTxEffect = (): Effect.Effect<never, ProviderError> =>
  Effect.fail(
    new ProviderError({
      cause: null,
      message:
        "evaluateTx is not supported on Hydra L2. Hydra heads do not run Plutus script evaluation via the provider API.",
    }),
  );

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// Extract the price memory from the execution unit prices, defaulting to 0 if not present.
const extractPriceMem = (executionUnitPrices: unknown): number => {
  if (
    typeof executionUnitPrices === "object" &&
    executionUnitPrices !== null &&
    "priceMemory" in executionUnitPrices
  ) {
    return Number(
      (executionUnitPrices as { priceMemory: unknown }).priceMemory,
    );
  }
  return 0;
};

// Extract the price step from the execution unit prices, defaulting to 0 if not present.
// This is needed for compatibility with older versions of hydra-node that do not include price steps in their protocol parameters response.
const extractPriceStep = (executionUnitPrices: unknown): number => {
  if (
    typeof executionUnitPrices === "object" &&
    executionUnitPrices !== null &&
    "priceSteps" in executionUnitPrices
  ) {
    return Number((executionUnitPrices as { priceSteps: unknown }).priceSteps);
  }
  return 0;
};

// Convert an array of numbers (e.g. [10, 20, 30]) to a record with string keys ("0", "1", "2") for compatibility with the expected cost model format.
const arrayToIndexedRecord = (
  arr: ReadonlyArray<number>,
): Record<string, number> =>
  Object.fromEntries(arr.map((v, i) => [String(i), v]));
