import { Effect, Schema } from "effect";
import * as Common from "./CommonMessage.js";

// =============================================================================
// Request Message Schemas
// =============================================================================

/**
 * Initialize a new Hydra Head.
 *
 * @since 0.1.0
 * @category schemas
 */
const InitMessageSchema = Schema.Struct({
  tag: Schema.Literal("Init"),
});
export type InitMessage = typeof InitMessageSchema.Type;

/**
 * Abort the Hydra Head initialization process.
 *
 * @since 0.1.0
 * @category schemas
 */
const AbortMessageSchema = Schema.Struct({
  tag: Schema.Literal("Abort"),
});
export type AbortMessage = typeof AbortMessageSchema.Type;

/**
 * Submit a new transaction to the Hydra Head.
 *
 * @since 0.1.0
 * @category schemas
 */
const NewTxMessageSchema = Schema.Struct({
  tag: Schema.Literal("NewTx"),
  transaction: Common.TransactionMessageSchema,
});
export type NewTxMessage = typeof NewTxMessageSchema.Type;

/**
 * Recover a failed commit deposit by transaction ID.
 *
 * @since 0.1.0
 * @category schemas
 */
const RecoverMessageSchema = Schema.Struct({
  tag: Schema.Literal("Recover"),
  recoverTxId: Schema.String,
});
export type RecoverMessage = typeof RecoverMessageSchema.Type;

/**
 * Request to decommit UTxO from the Hydra Head.
 *
 * @since 0.1.0
 * @category schemas
 */
const DecommitMessageSchema = Schema.Struct({
  tag: Schema.Literal("Decommit"),
  decommitTx: Common.TransactionMessageSchema,
});
export type DecommitMessage = typeof DecommitMessageSchema.Type;

/**
 * Close the Hydra Head.
 *
 * @since 0.1.0
 * @category schemas
 */
const CloseMessageSchema = Schema.Struct({
  tag: Schema.Literal("Close"),
});
export type CloseMessage = typeof CloseMessageSchema.Type;

/**
 * Contest the closure of the Hydra Head with a more recent snapshot.
 *
 * @since 0.1.0
 * @category schemas
 */
const ContestMessageSchema = Schema.Struct({
  tag: Schema.Literal("Contest"),
});
export type ContestMessage = typeof ContestMessageSchema.Type;

/**
 * Execute the fanout to distribute final UTxO back to Layer 1.
 *
 * @since 0.1.0
 * @category schemas
 */
const FanoutMessageSchema = Schema.Struct({
  tag: Schema.Literal("Fanout"),
});
export type FanoutMessage = typeof FanoutMessageSchema.Type;

/**
 * Side-load a snapshot (debugging/recovery feature).
 *
 * @since 0.1.0
 * @category schemas
 */
const SideLoadSnapshotMessageSchema = Schema.Struct({
  tag: Schema.Literal("SideLoadSnapshot"),
});
export type SideLoadSnapshotMessage = typeof SideLoadSnapshotMessageSchema.Type;

/**
 * Union of all possible request message types to send to a Hydra node.
 *
 * @since 0.1.0
 * @category schemas
 */
export const RequestMessageSchema = Schema.Union(
  InitMessageSchema,
  AbortMessageSchema,
  NewTxMessageSchema,
  RecoverMessageSchema,
  DecommitMessageSchema,
  CloseMessageSchema,
  ContestMessageSchema,
  FanoutMessageSchema,
  SideLoadSnapshotMessageSchema,
);
export type RequestMessage = typeof RequestMessageSchema.Type;
