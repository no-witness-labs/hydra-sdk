/**
 * `HydraProvider` — an `@evolution-sdk/evolution` `Provider` implementation
 * that targets a Hydra L2 head instead of a Cardano L1 node.
 *
 * Users can swap `BlockfrostProvider` for `HydraProvider` and use the same
 * evolution-sdk transaction-building API against a Hydra Head.
 */
import type {
  Address,  InlineDatum,
  TransactionInput,
  UTxO} from "@evolution-sdk/evolution";
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

const wrapError = <A>(
  effect: Effect.Effect<A, unknown>,
  message: string,
): Effect.Effect<A, ProviderError> =>
  effect.pipe(
    Effect.mapError(
      (cause) => new ProviderError({ cause, message }),
    ),
  );

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

const matchesAddress = (
  utxo: UTxO.UTxO,
  addressOrCredential: Address.Address | Credential.Credential,
): boolean => {
  if (Credential.is(addressOrCredential)) {
    return Equal.equals(utxo.address.paymentCredential, addressOrCredential);
  }
  return Equal.equals(utxo.address, addressOrCredential);
};

const hasUnit = (utxo: UTxO.UTxO, unit: string): boolean =>
  Assets.getByUnit(utxo.assets, unit) > 0n;

// ---------------------------------------------------------------------------
// HydraProvider
// ---------------------------------------------------------------------------

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

export class HydraProvider implements Provider {
  readonly Effect: ProviderEffect;

  private readonly httpUrl: string;
  private readonly head: HydraHead;

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

  // Promise-based wrappers
  getProtocolParameters = () =>
    Effect.runPromise(this.Effect.getProtocolParameters());

  getUtxos = (addressOrCredential: Parameters<Provider["getUtxos"]>[0]) =>
    Effect.runPromise(this.Effect.getUtxos(addressOrCredential));

  getUtxosWithUnit = (
    addressOrCredential: Parameters<Provider["getUtxosWithUnit"]>[0],
    unit: Parameters<Provider["getUtxosWithUnit"]>[1],
  ) =>
    Effect.runPromise(
      this.Effect.getUtxosWithUnit(addressOrCredential, unit),
    );

  getUtxoByUnit = (unit: Parameters<Provider["getUtxoByUnit"]>[0]) =>
    Effect.runPromise(this.Effect.getUtxoByUnit(unit));

  getUtxosByOutRef = (
    outRefs: Parameters<Provider["getUtxosByOutRef"]>[0],
  ) => Effect.runPromise(this.Effect.getUtxosByOutRef(outRefs));

  getDelegation = (
    rewardAddress: Parameters<Provider["getDelegation"]>[0],
  ) => Effect.runPromise(this.Effect.getDelegation(rewardAddress));

  getDatum = (datumHash: Parameters<Provider["getDatum"]>[0]) =>
    Effect.runPromise(this.Effect.getDatum(datumHash));

  awaitTx = (
    txHash: Parameters<Provider["awaitTx"]>[0],
    checkInterval?: Parameters<Provider["awaitTx"]>[1],
  ) => Effect.runPromise(this.Effect.awaitTx(txHash, checkInterval));

  submitTx = (tx: Parameters<Provider["submitTx"]>[0]) =>
    Effect.runPromise(this.Effect.submitTx(tx));

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
          maxTxExSteps: BigInt(
            (execUnits.steps ?? execUnits.cpu) as number,
          ),
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

const getUtxosEffect = (
  httpUrl: string,
  addressOrCredential: Address.Address | Credential.Credential,
): Effect.Effect<Array<UTxO.UTxO>, ProviderError> =>
  getAllUtxos(httpUrl).pipe(
    Effect.map((all) =>
      all.filter((u) => matchesAddress(u, addressOrCredential)),
    ),
  );

const getUtxosWithUnitEffect = (
  httpUrl: string,
  addressOrCredential: Address.Address | Credential.Credential,
  unit: string,
): Effect.Effect<Array<UTxO.UTxO>, ProviderError> =>
  getUtxosEffect(httpUrl, addressOrCredential).pipe(
    Effect.map((utxos) => utxos.filter((u) => hasUnit(u, unit))),
  );

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

const getDelegationEffect = (): Effect.Effect<Delegation, ProviderError> =>
  Effect.succeed({ poolId: null, rewards: 0n });

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
        const payload = event.payload as {
          transaction?: { txId?: string };
          validationError?: { reason?: string };
        } | undefined;
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

const hashTransactionBody = (
  body: TransactionBody.TransactionBody,
): TransactionHash.TransactionHash => {
  const bytes = TransactionBody.toCBORBytes(body);
  const digest = blake2b(bytes, { dkLen: 32 });
  return new TransactionHash.TransactionHash({ hash: digest });
};

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

const extractPriceMem = (executionUnitPrices: unknown): number => {
  if (
    typeof executionUnitPrices === "object" &&
    executionUnitPrices !== null &&
    "priceMemory" in executionUnitPrices
  ) {
    return Number((executionUnitPrices as { priceMemory: unknown }).priceMemory);
  }
  return 0;
};

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

const arrayToIndexedRecord = (arr: ReadonlyArray<number>): Record<string, number> =>
  Object.fromEntries(arr.map((v, i) => [String(i), v]));
