import { Effect, Option, Record, Schema } from "effect";

const TransactionMessageSchema = Schema.Struct({
    type: Schema.Literal("Tx ConwayEra", "Unwitnessed Tx ConwayEra", "Witnessed Tx ConwayEra"),
    description: Schema.String,
    cborHex: Schema.String,
    txId: Schema.String,
  })

export const GreetingsMessageSchema = Schema.Struct({
  tag: Schema.Literal("Greetings"),
  me: Schema.Struct({
    vkey: Schema.String,
  }),
  headStatus: Schema.Literal("Idle", "Initializing", "Open", "Closed", "FanoutPossible", "Final"),
  hydraHeadId: Schema.String,
  snapshotUtxo: Schema.String, // TODO: make a better match
  timestamp: Schema.DateTimeUtcFromDate,
  hydraNodeVersion: Schema.String,
});
export type GreetingsMessage = typeof GreetingsMessageSchema.Type;

export const CommandFailedMessageSchema = Schema.Struct({
  tag: Schema.Literal("CommandFailed"),
  clientInput: Schema.Struct({
    tag: Schema.Literal("Init", "Abort", "NewTx", "Deccomit", "Recover", "Close", "Contest", "Fanout", "SideLoadSnapshot"),
    transaction: Schema.optional(
      TransactionMessageSchema
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
  timestamp: Schema.DateTimeUtcFromDate,
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
  timestamp: Schema.DateTimeUtcFromDate,
});
export type PeerDisconnectedMessage =
  typeof PeerDisconnectedMessageSchema.Type;

export const NetworkConnectedMessageSchema = Schema.Struct({
  tag: Schema.Literal("NetworkConnected"),
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtcFromDate,
});
export type NetworkConnectedMessage =
  typeof NetworkConnectedMessageSchema.Type;

export const NetworkDisconnectedMessageSchema = Schema.Struct({
  tag: Schema.Literal("NetworkDisconnected"),
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtcFromDate,
});
export type NetworkDisconnectedMessage =
  typeof NetworkDisconnectedMessageSchema.Type;

export const NetworkVersionMismatchMessageSchema = Schema.Struct({
  tag: Schema.Literal("NetworkVersionMismatch"),
  ourVersion: Schema.NullOr(Schema.Int),
  theirVersion: Schema.Int,
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtcFromDate,
});
export type NetworkVersionMismatchMessage =
  typeof NetworkVersionMismatchMessageSchema.Type;

export const NetworkClusterIDMismatchMessageSchema = Schema.Struct({
  tag: Schema.Literal("NetworkClusterIDMismatch"),
  clusterPeers: Schema.String,
  misconfiguredPeers: Schema.String,
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtcFromDate,
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
  timestamp: Schema.DateTimeUtcFromDate,
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
  timestamp: Schema.DateTimeUtcFromDate,
});
export type CommittedMessage = typeof CommittedMessageSchema.Type;

export const HeadIsOpenMessageSchema = Schema.Struct({
  tag: Schema.Literal("HeadIsOpen"),
  headId: Schema.String,
  utxo: Schema.String, // TODO: make a better match
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtcFromDate,
});
export type HeadIsOpenMessage = typeof HeadIsOpenMessageSchema.Type;

export const HeadIsClosedMessageSchema = Schema.Struct({
  tag: Schema.Literal("HeadIsClosed"),
  headId: Schema.String,
  snapshotNumber: Schema.Int,
  contestationDeadline: Schema.DateTimeUtcFromDate,
  utxo: Schema.String, // TODO: make a better match
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtcFromDate,
});
export type HeadIsClosedMessage = typeof HeadIsClosedMessageSchema.Type;


export const HeadIsContestedMessageSchema = Schema.Struct({
  tag: Schema.Literal("HeadIsContested"),
  headId: Schema.String,
  snapshotNumber: Schema.Int,
  contestationDeadline: Schema.DateTimeUtcFromDate,
  utxo: Schema.String, // TODO: make a better match
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtcFromDate,
});
export type HeadIsContestedMessage = typeof HeadIsContestedMessageSchema.Type;

export const ReadyToFanoutMessageSchema = Schema.Struct({
  tag: Schema.Literal("ReadyToFanout"),
  headId: Schema.String,
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtcFromDate,
});
export type ReadyToFanoutMessage = typeof ReadyToFanoutMessageSchema.Type;

export const HeadIsAbortedMessageSchema = Schema.Struct({
  tag: Schema.Literal("HeadIsAborted"),
  headId: Schema.String,
  utxo: Schema.String, // TODO: make a better match
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtcFromDate,
});
export type HeadIsAbortedMessage = typeof HeadIsAbortedMessageSchema.Type;

export const HeadIsFinalizedMessageSchema = Schema.Struct({
  tag: Schema.Literal("HeadIsFinalized"),
  headId: Schema.String,
  utxo: Schema.String, // TODO: make a better match
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtcFromDate,
});
export type HeadIsFinalizedMessage = typeof HeadIsFinalizedMessageSchema.Type;

export const TxValidMessageSchema = Schema.Struct({
  tag: Schema.Literal("TxValid"),
  headId: Schema.String,
  transactionId: Schema.String,
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtcFromDate,
});
export type TxValidMessage = typeof TxValidMessageSchema.Type;

export const TxInvalidMessageSchema = Schema.Struct({
  tag: Schema.Literal("TxInvalid"),
  headId: Schema.String,
  utxo: Schema.String, // TODO: make a better match
  transaction: TransactionMessageSchema,
  validationError: Schema.Struct({
    reason: Schema.String
  }),
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtcFromDate,
});
export type TxInvalidMessage = typeof TxInvalidMessageSchema.Type;



export const FinalizedMessageSchema = Schema.Struct({
  tag: Schema.Literal("HeadIsFinalized"),
});
export type FinalizedMessage = typeof FinalizedMessageSchema.Type;


export const SnapshotConfirmedMessageSchema = Schema.Struct({
  tag: Schema.Literal("SnapshotConfirmed"),
  snapshot: Schema.Struct({
    confirmedTransactions: Schema.optional(Schema.Array(Schema.String)),
    confirmed: Schema.optional(
      Schema.Array(
        Schema.Record({
          key: Schema.String,
          value: Schema.Unknown,
        }),
      ),
    ),
  }),
});
export type SnapshotConfirmedMessage =
  typeof SnapshotConfirmedMessageSchema.Type;

export const HydraResponseMessageSchema = Schema.Union(
  GreetingsMessageSchema,
  CommandFailedMessageSchema,
  HeadIsInitializingMessageSchema,
  HeadIsOpenMessageSchema,
  HeadIsClosedMessageSchema,
  FinalizedMessageSchema,
  ReadyToFanoutMessageSchema,
  TxValidMessageSchema,
  TxInvalidMessageSchema,
  PostTxOnChainFailedMessageSchema,
  SnapshotConfirmedMessageSchema,
);
export type HydraMessage = typeof HydraResponseMessageSchema.Type;

export const decodeHydraMessage = Schema.decode(
  Schema.parseJson(HydraResponseMessageSchema),
);
