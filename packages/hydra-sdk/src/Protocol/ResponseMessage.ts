import { Effect, Schema } from "effect";
import * as Common from "./CommonMessage.js"

export const GreetingsMessageSchema = Schema.Struct({
  tag: Schema.Literal("Greetings"),
  me: Schema.Struct({
    vkey: Schema.String,
  }),
  headStatus: Schema.Literal("Idle", "Initializing", "Open", "Closed", "FanoutPossible", "Final"),
  hydraHeadId: Schema.String,
  snapshotUtxo: Schema.String, // TODO: make a better match
  timestamp: Schema.DateTimeUtc,
  hydraNodeVersion: Schema.String,
});
export type GreetingsMessage = typeof GreetingsMessageSchema.Type;

export const CommandFailedMessageSchema = Schema.Struct({
  tag: Schema.Literal("CommandFailed"),
  clientInput: Schema.Struct({
    tag: Schema.Literal("Init", "Abort", "NewTx", "Decommit", "Recover", "Close", "Contest", "Fanout", "SideLoadSnapshot"),
    transaction: Schema.optional(
      Common.TransactionMessageSchema
    ),
  }),
});
export type CommandFailedMessage = typeof CommandFailedMessageSchema.Type;

export const PostTxOnChainFailedMessageSchema = Schema.Struct({
  tag: Schema.Literal("PostTxOnChainFailed"),
  postChainTx: Schema.Struct({
    tag: Schema.Literal("InitTx", "AbortTx", "CollectComTx", "RecoverTx", "IncrementTx", "DecrementTx", "CloseTx", "ContestTx", "FanoutTx"), // TODO: Error in the docs
    participants: Schema.Array(Schema.String),
    headParameters: Schema.Struct({
      contestationPeriod: Schema.Int,
      parties: Schema.Array(
        Schema.Struct({
          vkey: Schema.String
      })),
    }),
  }),
  postTxError: Schema.Record({ key: Schema.String, value: Schema.Any }), // Not meant to be machine-processed
});
export type PostTxOnChainFailedMessage =
  typeof PostTxOnChainFailedMessageSchema.Type;

export const PeerConnectedMessageSchema = Schema.Struct({
  tag: Schema.Literal("PeerConnected"),
  peer: Schema.Struct({
    hostname: Schema.String,
    port: Schema.Int,
  }),
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type PeerConnectedMessage =
  typeof PeerConnectedMessageSchema.Type;

export const PeerDisconnectedMessageSchema = Schema.Struct({
  tag: Schema.Literal("PeerDisconnected"),
  peer: Schema.Struct({
    hostname: Schema.String,
    port: Schema.Int,
  }),
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type PeerDisconnectedMessage =
  typeof PeerDisconnectedMessageSchema.Type;

export const NetworkConnectedMessageSchema = Schema.Struct({
  tag: Schema.Literal("NetworkConnected"),
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type NetworkConnectedMessage =
  typeof NetworkConnectedMessageSchema.Type;

export const NetworkDisconnectedMessageSchema = Schema.Struct({
  tag: Schema.Literal("NetworkDisconnected"),
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type NetworkDisconnectedMessage =
  typeof NetworkDisconnectedMessageSchema.Type;

export const NetworkVersionMismatchMessageSchema = Schema.Struct({
  tag: Schema.Literal("NetworkVersionMismatch"),
  ourVersion: Schema.NullOr(Schema.Int),
  theirVersion: Schema.Int,
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type NetworkVersionMismatchMessage =
  typeof NetworkVersionMismatchMessageSchema.Type;

export const NetworkClusterIDMismatchMessageSchema = Schema.Struct({
  tag: Schema.Literal("NetworkClusterIDMismatch"),
  clusterPeers: Schema.String,
  misconfiguredPeers: Schema.String,
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type NetworkClusterIDMismatchMessage =
  typeof NetworkClusterIDMismatchMessageSchema.Type;

export const HeadIsInitializingMessageSchema = Schema.Struct({
  tag: Schema.Literal("HeadIsInitializing"),
  headId: Schema.String,
  parties: Schema.Array(
    Schema.Struct({
      vkey: Schema.String
  })),
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type HeadIsInitializingMessage = typeof HeadIsInitializingMessageSchema.Type;

export const CommittedMessageSchema = Schema.Struct({
  tag: Schema.Literal("Committed"),
  headId: Schema.String,
  parties: Schema.Array(
    Schema.Struct({
      vkey: Schema.String
  })),
  utxo: Schema.String, // TODO: make a better match
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type CommittedMessage = typeof CommittedMessageSchema.Type;

export const HeadIsOpenMessageSchema = Schema.Struct({
  tag: Schema.Literal("HeadIsOpen"),
  headId: Schema.String,
  utxo: Schema.String, // TODO: make a better match
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type HeadIsOpenMessage = typeof HeadIsOpenMessageSchema.Type;

export const HeadIsClosedMessageSchema = Schema.Struct({
  tag: Schema.Literal("HeadIsClosed"),
  headId: Schema.String,
  snapshotNumber: Schema.Int,
  contestationDeadline: Schema.DateTimeUtc,
  utxo: Schema.String, // TODO: make a better match
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type HeadIsClosedMessage = typeof HeadIsClosedMessageSchema.Type;


export const HeadIsContestedMessageSchema = Schema.Struct({
  tag: Schema.Literal("HeadIsContested"),
  headId: Schema.String,
  snapshotNumber: Schema.Int,
  contestationDeadline: Schema.DateTimeUtc,
  utxo: Schema.String, // TODO: make a better match
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type HeadIsContestedMessage = typeof HeadIsContestedMessageSchema.Type;

export const ReadyToFanoutMessageSchema = Schema.Struct({
  tag: Schema.Literal("ReadyToFanout"),
  headId: Schema.String,
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type ReadyToFanoutMessage = typeof ReadyToFanoutMessageSchema.Type;

export const HeadIsAbortedMessageSchema = Schema.Struct({
  tag: Schema.Literal("HeadIsAborted"),
  headId: Schema.String,
  utxo: Schema.String, // TODO: make a better match
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type HeadIsAbortedMessage = typeof HeadIsAbortedMessageSchema.Type;

export const HeadIsFinalizedMessageSchema = Schema.Struct({
  tag: Schema.Literal("HeadIsFinalized"),
  headId: Schema.String,
  utxo: Schema.String, // TODO: make a better match
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type HeadIsFinalizedMessage = typeof HeadIsFinalizedMessageSchema.Type;

export const TxValidMessageSchema = Schema.Struct({
  tag: Schema.Literal("TxValid"),
  headId: Schema.String,
  transactionId: Schema.String,
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type TxValidMessage = typeof TxValidMessageSchema.Type;

export const TxInvalidMessageSchema = Schema.Struct({
  tag: Schema.Literal("TxInvalid"),
  headId: Schema.String,
  utxo: Schema.String, // TODO: make a better match
  transaction: Common.TransactionMessageSchema,
  validationError: Schema.Struct({
    reason: Schema.String
  }),
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type TxInvalidMessage = typeof TxInvalidMessageSchema.Type;

export const SnapshotConfirmedMessageSchema = Schema.Struct({
  tag: Schema.Literal("SnapshotConfirmed"),
  headId: Schema.String,
  snapshot: Schema.Struct({
    headId: Schema.String,
    version: Schema.Int,
    number: Schema.Int,
    confirmed: Schema.Array(Common.TransactionMessageSchema),
    utxo: Schema.String,
    utxoToCommit: Schema.optional(Schema.String),
    utxoToDecommit: Schema.optional(Schema.String),
  }),
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type SnapshotConfirmedMessage =
  typeof SnapshotConfirmedMessageSchema.Type;

export const InvalidInputMessageSchema = Schema.Struct({
  tag: Schema.Literal("InvalidInput"),
  reason: Schema.String,
  input: Schema.String,
});
export type InvalidInputMessage = typeof InvalidInputMessageSchema.Type;

export const IgnoredHeadInitializingMessageSchema = Schema.Struct({
  tag: Schema.Literal("IgnoredHeadInitializing"),
  headId: Schema.String,
  contestationPeriod: Schema.Int,
  parties: Schema.Array(
      Schema.Struct({
        vkey: Schema.String
    })),
  participants: Schema.Array(Schema.String),
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type IgnoredHeadInitializingMessage =
  typeof IgnoredHeadInitializingMessageSchema.Type;

export const DecommitInvalidMessageSchema = Schema.Struct({
  tag: Schema.Literal("DecommitInvalid"),
  headId: Schema.String,
  decommitTx: Common.TransactionMessageSchema,
  decommitInvalidReason: Schema.Union(
    Schema.Struct({
      tag: Schema.Literal("DecommitTxInvalid"),
      localUTxO: Schema.String,
      validationError: Schema.Struct({
        reason: Schema.String
      })
    }),
    Schema.Struct({
      tag: Schema.Literal("DecommitAlreadyInFlight"),
      otherDecommitTxId: Schema.String
    })
  ),
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type DecommitInvalidMessage =
  typeof DecommitInvalidMessageSchema.Type;

export const DecommitRequestedMessageSchema = Schema.Struct({
  tag: Schema.Literal("DecommitRequested"),
  headId: Schema.String,
  decommitTx: Common.TransactionMessageSchema,
  utxoToDecommit: Schema.String, // TODO: make a better match
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type DecommitRequestedMessage = typeof DecommitRequestedMessageSchema.Type;

export const DecommitApprovedMessageSchema = Schema.Struct({
  tag: Schema.Literal("DecommitApproved"),
  headId: Schema.String,
  decommitTxId: Schema.String,
  utxoToDecommit: Schema.String, // TODO: make a better match
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type DecommitApprovedMessage = typeof DecommitApprovedMessageSchema.Type;

export const DecommitFinalizedMessageSchema = Schema.Struct({
  tag: Schema.Literal("DecommitFinalized"),
  headId: Schema.String,
  distributedUTxO: Schema.String, // TODO: make a better match
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type DecommitFinalizedMessage = typeof DecommitFinalizedMessageSchema.Type;

export const CommitRecordedMessageSchema = Schema.Struct({
  tag: Schema.Literal("CommitRecorded"),
  headId: Schema.String,
  utxoToCommit: Schema.String, // TODO: make a better match
  pendingDeposit: Schema.String,
  deadline: Schema.DateTimeUtc,
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type CommitRecordedMessage = typeof CommitRecordedMessageSchema.Type;

export const CommitApprovedMessageSchema = Schema.Struct({
  tag: Schema.Literal("CommitApproved"),
  headId: Schema.String,
  utxoToCommit: Schema.String, // TODO: make a better match
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type CommitApprovedMessage = typeof CommitApprovedMessageSchema.Type;

export const CommitFinalizedMessageSchema = Schema.Struct({
  tag: Schema.Literal("CommitFinalized"),
  headId: Schema.String,
  depositTxId: Schema.String,
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type CommitFinalizedMessage = typeof CommitFinalizedMessageSchema.Type;

export const CommitRecoveredMessageSchema = Schema.Struct({
  tag: Schema.Literal("CommitRecovered"),
  headId: Schema.String,
  recoveredUTxO: Schema.String, // TODO: make a better match
  recoveredTxId: Schema.String,
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type CommitRecoveredMessage = typeof CommitRecoveredMessageSchema.Type;

export const SnapshotSideLoadedMessageSchema = Schema.Struct({
  tag: Schema.Literal("SnapshotSideLoaded"),
  headId: Schema.String,
  snapshotNumber: Schema.Int,
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type SnapshotSideLoadedMessage = typeof SnapshotSideLoadedMessageSchema.Type;

export const EventLogRotatedMessageSchema = Schema.Struct({
  tag: Schema.Literal("EventLogRotated"),
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type EventLogRotatedMessage = typeof EventLogRotatedMessageSchema.Type;

export const ResponseMessageSchema = Schema.Union(
  GreetingsMessageSchema,
  CommandFailedMessageSchema,
  PostTxOnChainFailedMessageSchema,
  PeerConnectedMessageSchema,
  PeerDisconnectedMessageSchema,
  NetworkConnectedMessageSchema,
  NetworkDisconnectedMessageSchema,
  NetworkVersionMismatchMessageSchema,
  NetworkClusterIDMismatchMessageSchema,
  HeadIsInitializingMessageSchema,
  CommittedMessageSchema,
  HeadIsOpenMessageSchema,
  HeadIsClosedMessageSchema,
  HeadIsContestedMessageSchema,
  ReadyToFanoutMessageSchema,
  HeadIsAbortedMessageSchema,
  HeadIsFinalizedMessageSchema,
  TxValidMessageSchema,
  TxInvalidMessageSchema,
  SnapshotConfirmedMessageSchema,
  InvalidInputMessageSchema,
  IgnoredHeadInitializingMessageSchema,
  DecommitInvalidMessageSchema,
  DecommitRequestedMessageSchema,
  DecommitApprovedMessageSchema,
  DecommitFinalizedMessageSchema,
  CommitRecordedMessageSchema,
  CommitApprovedMessageSchema,
  CommitFinalizedMessageSchema,
  CommitRecoveredMessageSchema,
  SnapshotSideLoadedMessageSchema,
  EventLogRotatedMessageSchema,
);
export type ResponseMessage = typeof ResponseMessageSchema.Type;

