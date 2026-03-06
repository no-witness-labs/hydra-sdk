import { Schema } from "effect";

import { UTxOSchema } from "./Types.js";

// =============================================================================
// Common Message Schemas
// =============================================================================

/**
 * Cardano transaction representation in the Hydra protocol.
 *
 * @since 0.1.0
 * @category schemas
 */
export const TransactionMessageSchema = Schema.Struct({
  type: Schema.Literal(
    "Tx ConwayEra",
    "Unwitnessed Tx ConwayEra",
    "Witnessed Tx ConwayEra",
  ),
  description: Schema.String,
  cborHex: Schema.String,
  txId: Schema.String,
});
export type TransactionMessage = typeof TransactionMessageSchema.Type;

/**
 * Snapshot visibility state indicating what snapshots have been seen or requested.
 *
 * @since 0.1.0
 * @category schemas
 */
export const SeenSnapshotSchema = Schema.Union(
  Schema.Struct({
    tag: Schema.Literal("NoSeenSnapshot"),
  }),
  Schema.Struct({
    tag: Schema.Literal("LastSeenSnapshot"),
    lastSeen: Schema.Int,
  }),
  Schema.Struct({
    tag: Schema.Literal("RequestedSnapshot"),
    lastSeen: Schema.Int,
    requested: Schema.Int,
  }),
  Schema.Struct({
    tag: Schema.Literal("SeenSnapshot"),
    snapshot: Schema.Struct({
      headId: Schema.String,
      version: Schema.Int,
      number: Schema.Int,
      confirmed: Schema.Array(TransactionMessageSchema),
      utxo: UTxOSchema,
      utxoToCommit: Schema.optional(UTxOSchema),
      utxoToDecommit: Schema.optional(UTxOSchema),
    }),
    signatories: Schema.Record({ key: Schema.String, value: Schema.Any }),
  }),
);
export type SeenSnapshot = typeof SeenSnapshotSchema.Type;

/**
 * Confirmed snapshot with multi-signatures from all parties.
 *
 * @since 0.1.0
 * @category schemas
 */
export const ConfirmedSnapshotSchema = Schema.Union(
  Schema.Struct({
    tag: Schema.Literal("InitialSnapshot"),
    headId: Schema.String,
    initialUTxO: UTxOSchema,
  }),
  Schema.Struct({
    tag: Schema.Literal("ConfirmedSnapshot"),
    snapshot: Schema.Struct({
      headId: Schema.String,
      version: Schema.Int,
      number: Schema.Int,
      confirmed: Schema.Array(TransactionMessageSchema),
      utxo: UTxOSchema,
      utxoToCommit: Schema.optional(Schema.NullOr(UTxOSchema)),
      utxoToDecommit: Schema.optional(Schema.NullOr(UTxOSchema)),
    }),
    signatures: Schema.Struct({
      multiSignature: Schema.Union(
        Schema.String,
        Schema.Array(Schema.String),
      ),
    }),
  }),
);
export type ConfirmedSnapshot = typeof ConfirmedSnapshotSchema.Type;
