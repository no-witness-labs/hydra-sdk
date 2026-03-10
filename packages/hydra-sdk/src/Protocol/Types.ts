import { Schema } from "effect";

// =============================================================================
// Shared Domain Type Schemas
// =============================================================================

// --- Value types ---

/**
 * Lovelace-only value representation.
 *
 * @since 0.2.0
 * @category schemas
 */
export const LovelaceSchema = Schema.Struct({ lovelace: Schema.Number });

/**
 * Native token amounts keyed by asset name.
 *
 * @since 0.2.0
 * @category schemas
 */
export const TokenSchema = Schema.Record({
  key: Schema.String,
  value: Schema.Number,
});

/**
 * Multi-asset value: lovelace plus optional native tokens keyed by policy ID.
 *
 * @since 0.2.0
 * @category schemas
 */
export const ValueSchema = Schema.Struct({
  lovelace: Schema.Number,
}).pipe(
  Schema.extend(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
);
export type Value = typeof ValueSchema.Type;

// --- UTxO types ---

/**
 * Transaction output with address, value, and optional datum/script fields.
 *
 * @since 0.2.0
 * @category schemas
 */
export const TxOutSchema = Schema.Struct({
  address: Schema.String,
  value: ValueSchema,
  datum: Schema.optional(Schema.NullOr(Schema.String)),
  datumHash: Schema.optional(Schema.NullOr(Schema.String)),
  datumhash: Schema.optional(Schema.NullOr(Schema.String)),
  inlineDatum: Schema.optional(Schema.Unknown),
  inlineDatumRaw: Schema.optional(Schema.NullOr(Schema.String)),
  inlineDatumhash: Schema.optional(Schema.NullOr(Schema.String)),
  referenceScript: Schema.optional(Schema.Unknown),
});
export type TxOut = typeof TxOutSchema.Type;

/**
 * UTxO set: map from "txhash#index" to TxOut.
 *
 * @since 0.2.0
 * @category schemas
 */
export const UTxOSchema = Schema.Record({
  key: Schema.String,
  value: TxOutSchema,
});
export type UTxO = typeof UTxOSchema.Type;

// --- Shared types ---

/**
 * Hydra party identified by verification key.
 *
 * @since 0.2.0
 * @category schemas
 */
export const PartySchema = Schema.Struct({ vkey: Schema.String });
export type Party = typeof PartySchema.Type;
