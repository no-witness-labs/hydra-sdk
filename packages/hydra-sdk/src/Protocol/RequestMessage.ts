import { Effect, Schema } from "effect";
import * as Common from "./CommonMessage.js"

const InitMessageSchema = Schema.Struct({
    tag: Schema.Literal("Init"),
})
export type InitMessage = typeof InitMessageSchema.Type;

const AbortMessageSchema = Schema.Struct({
    tag: Schema.Literal("Abort"),
})
export type AbortMessage = typeof AbortMessageSchema.Type;

const NewTxMessageSchema = Schema.Struct({
    tag: Schema.Literal("NewTx"),
    transaction: Common.TransactionMessageSchema
})
export type NewTxMessage = typeof NewTxMessageSchema.Type;

const RecoverMessageSchema = Schema.Struct({
    tag: Schema.Literal("Recover"),
    recoverTxId: Schema.String
})
export type RecoverMessage = typeof RecoverMessageSchema.Type;

const DecommitMessageSchema = Schema.Struct({
    tag: Schema.Literal("Decommit"),
    decommitTx: Common.TransactionMessageSchema
})
export type DecommitMessage = typeof DecommitMessageSchema.Type;

const CloseMessageSchema = Schema.Struct({
    tag: Schema.Literal("Close"),
})
export type CloseMessage = typeof CloseMessageSchema.Type;

const ContestMessageSchema = Schema.Struct({
    tag: Schema.Literal("Contest"),
})
export type ContestMessage = typeof ContestMessageSchema.Type;

const FanoutMessageSchema = Schema.Struct({
    tag: Schema.Literal("Fanout"),
})
export type FanoutMessage = typeof FanoutMessageSchema.Type;

const SideLoadSnapshotMessageSchema = Schema.Struct({
    tag: Schema.Literal("SideLoadSnapshot"),
})
export type SideLoadSnapshotMessage = typeof SideLoadSnapshotMessageSchema.Type;

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
