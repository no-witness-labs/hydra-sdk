import { Schema } from "effect";

import * as Common from "./CommonMessage.js";
import { PartySchema, UTxOSchema } from "./Types.js";

// =============================================================================
// Response Message Schemas
// =============================================================================

/**
 * Greeting response from the Hydra Head.
 *
 * @since 0.1.0
 * @category schemas
 */
export const GreetingsMessageSchema = Schema.Struct({
  tag: Schema.optional(Schema.Literal("Greetings")),
  me: PartySchema,
  headStatus: Schema.Literal(
    "Idle",
    "Initializing",
    "Open",
    "Closed",
    "FanoutPossible",
    "Final",
  ),
  hydraHeadId: Schema.optional(Schema.String),
  snapshotUtxo: Schema.optional(UTxOSchema),
  timestamp: Schema.optional(Schema.DateTimeUtc),
  hydraNodeVersion: Schema.String,
  env: Schema.optional(Schema.String),
  networkInfo: Schema.optional(Schema.Unknown),
  chainSyncedStatus: Schema.optional(Schema.Unknown),
  currentSlot: Schema.optional(Schema.Int),
});
export type GreetingsMessage = typeof GreetingsMessageSchema.Type;

/**
 * Command failed response indicating a client command could not be executed.
 *
 * @since 0.1.0
 * @category schemas
 */
export const CommandFailedMessageSchema = Schema.Struct({
  tag: Schema.Literal("CommandFailed"),
  clientInput: Schema.Struct({
    tag: Schema.Literal(
      "Init",
      "Abort",
      "NewTx",
      "Decommit",
      "Recover",
      "Close",
      "Contest",
      "Fanout",
      "SideLoadSnapshot",
      "SafeClose",
    ),
    transaction: Schema.optional(Common.TransactionMessageSchema),
  }),
});
export type CommandFailedMessage = typeof CommandFailedMessageSchema.Type;

/**
 * Post transaction on-chain failed response.
 *
 * @since 0.1.0
 * @category schemas
 */
export const PostTxOnChainFailedMessageSchema = Schema.Struct({
  tag: Schema.Literal("PostTxOnChainFailed"),
  postChainTx: Schema.Struct({
    tag: Schema.Literal(
      "InitTx",
      "AbortTx",
      "CollectComTx",
      "RecoverTx",
      "IncrementTx",
      "DecrementTx",
      "CloseTx",
      "ContestTx",
      "FanoutTx",
    ), // TODO: Error in the docs
    participants: Schema.Array(Schema.String),
    headParameters: Schema.Struct({
      contestationPeriod: Schema.Int,
      parties: Schema.Array(PartySchema),
    }),
  }),
  postTxError: Schema.Record({ key: Schema.String, value: Schema.Any }), // Not meant to be machine-processed
});
export type PostTxOnChainFailedMessage =
  typeof PostTxOnChainFailedMessageSchema.Type;

/**
 * Peer connected event.
 *
 * @since 0.1.0
 * @category schemas
 */
export const PeerConnectedMessageSchema = Schema.Struct({
  tag: Schema.Literal("PeerConnected"),
  peer: Schema.Struct({
    hostname: Schema.String,
    port: Schema.Int,
  }),
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type PeerConnectedMessage = typeof PeerConnectedMessageSchema.Type;

/**
 * Peer disconnected event.
 *
 * @since 0.1.0
 * @category schemas
 */
export const PeerDisconnectedMessageSchema = Schema.Struct({
  tag: Schema.Literal("PeerDisconnected"),
  peer: Schema.Struct({
    hostname: Schema.String,
    port: Schema.Int,
  }),
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type PeerDisconnectedMessage = typeof PeerDisconnectedMessageSchema.Type;

/**
 * Network connected event.
 *
 * @since 0.1.0
 * @category schemas
 */
export const NetworkConnectedMessageSchema = Schema.Struct({
  tag: Schema.Literal("NetworkConnected"),
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type NetworkConnectedMessage = typeof NetworkConnectedMessageSchema.Type;

/**
 * Network disconnected event.
 *
 * @since 0.1.0
 * @category schemas
 */
export const NetworkDisconnectedMessageSchema = Schema.Struct({
  tag: Schema.Literal("NetworkDisconnected"),
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type NetworkDisconnectedMessage =
  typeof NetworkDisconnectedMessageSchema.Type;

/**
 * Network version mismatch event.
 *
 * @since 0.1.0
 * @category schemas
 */
export const NetworkVersionMismatchMessageSchema = Schema.Struct({
  tag: Schema.Literal("NetworkVersionMismatch"),
  ourVersion: Schema.NullOr(Schema.Int),
  theirVersion: Schema.Int,
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type NetworkVersionMismatchMessage =
  typeof NetworkVersionMismatchMessageSchema.Type;

/**
 * Network cluster ID mismatch event.
 *
 * @since 0.1.0
 * @category schemas
 */
export const NetworkClusterIDMismatchMessageSchema = Schema.Struct({
  tag: Schema.Literal("NetworkClusterIDMismatch"),
  clusterPeers: Schema.String,
  misconfiguredPeers: Schema.String,
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type NetworkClusterIDMismatchMessage =
  typeof NetworkClusterIDMismatchMessageSchema.Type;

/**
 * Head is initializing event.
 *
 * @since 0.1.0
 * @category schemas
 */
export const HeadIsInitializingMessageSchema = Schema.Struct({
  tag: Schema.Literal("HeadIsInitializing"),
  headId: Schema.String,
  parties: Schema.Array(PartySchema),
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type HeadIsInitializingMessage =
  typeof HeadIsInitializingMessageSchema.Type;

/**
 * Committed event indicating a party has committed funds to the Head.
 *
 * @since 0.1.0
 * @category schemas
 */
export const CommittedMessageSchema = Schema.Struct({
  tag: Schema.Literal("Committed"),
  headId: Schema.String,
  parties: Schema.Array(PartySchema),
  utxo: UTxOSchema,
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type CommittedMessage = typeof CommittedMessageSchema.Type;

/**
 * Head is open event.
 *
 * @since 0.1.0
 * @category schemas
 */
export const HeadIsOpenMessageSchema = Schema.Struct({
  tag: Schema.Literal("HeadIsOpen"),
  headId: Schema.String,
  utxo: UTxOSchema,
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type HeadIsOpenMessage = typeof HeadIsOpenMessageSchema.Type;

/**
 * Head is closed event.
 *
 * @since 0.1.0
 * @category schemas
 */
export const HeadIsClosedMessageSchema = Schema.Struct({
  tag: Schema.Literal("HeadIsClosed"),
  headId: Schema.String,
  snapshotNumber: Schema.Int,
  contestationDeadline: Schema.DateTimeUtc,
  utxo: UTxOSchema,
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type HeadIsClosedMessage = typeof HeadIsClosedMessageSchema.Type;

/**
 * Head is contested event.
 *
 * @since 0.1.0
 * @category schemas
 */
export const HeadIsContestedMessageSchema = Schema.Struct({
  tag: Schema.Literal("HeadIsContested"),
  headId: Schema.String,
  snapshotNumber: Schema.Int,
  contestationDeadline: Schema.DateTimeUtc,
  utxo: UTxOSchema,
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type HeadIsContestedMessage = typeof HeadIsContestedMessageSchema.Type;

/**
 * Ready to fanout event.
 *
 * @since 0.1.0
 * @category schemas
 */
export const ReadyToFanoutMessageSchema = Schema.Struct({
  tag: Schema.Literal("ReadyToFanout"),
  headId: Schema.String,
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type ReadyToFanoutMessage = typeof ReadyToFanoutMessageSchema.Type;

/**
 * Head is aborted event.
 *
 * @since 0.1.0
 * @category schemas
 */
export const HeadIsAbortedMessageSchema = Schema.Struct({
  tag: Schema.Literal("HeadIsAborted"),
  headId: Schema.String,
  utxo: UTxOSchema,
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type HeadIsAbortedMessage = typeof HeadIsAbortedMessageSchema.Type;

/**
 * Head is finalized event.
 *
 * @since 0.1.0
 * @category schemas
 */
export const HeadIsFinalizedMessageSchema = Schema.Struct({
  tag: Schema.Literal("HeadIsFinalized"),
  headId: Schema.String,
  utxo: UTxOSchema,
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type HeadIsFinalizedMessage = typeof HeadIsFinalizedMessageSchema.Type;

/**
 * Transaction valid event.
 *
 * @since 0.1.0
 * @category schemas
 */
export const TxValidMessageSchema = Schema.Struct({
  tag: Schema.Literal("TxValid"),
  headId: Schema.String,
  transactionId: Schema.String,
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type TxValidMessage = typeof TxValidMessageSchema.Type;

/**
 * Transaction invalid event.
 *
 * @since 0.1.0
 * @category schemas
 */
export const TxInvalidMessageSchema = Schema.Struct({
  tag: Schema.Literal("TxInvalid"),
  headId: Schema.String,
  utxo: UTxOSchema,
  transaction: Common.TransactionMessageSchema,
  validationError: Schema.Struct({
    reason: Schema.String,
  }),
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type TxInvalidMessage = typeof TxInvalidMessageSchema.Type;

/**
 * Snapshot confirmed event.
 *
 * @since 0.1.0
 * @category schemas
 */
export const SnapshotConfirmedMessageSchema = Schema.Struct({
  tag: Schema.Literal("SnapshotConfirmed"),
  headId: Schema.String,
  snapshot: Schema.Struct({
    headId: Schema.String,
    version: Schema.Int,
    number: Schema.Int,
    confirmed: Schema.Array(Common.TransactionMessageSchema),
    utxo: UTxOSchema,
    utxoToCommit: Schema.optional(UTxOSchema),
    utxoToDecommit: Schema.optional(UTxOSchema),
  }),
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type SnapshotConfirmedMessage =
  typeof SnapshotConfirmedMessageSchema.Type;

/**
 * Invalid input response.
 *
 * @since 0.1.0
 * @category schemas
 */
export const InvalidInputMessageSchema = Schema.Struct({
  tag: Schema.Literal("InvalidInput"),
  reason: Schema.String,
  input: Schema.String,
});
export type InvalidInputMessage = typeof InvalidInputMessageSchema.Type;

/**
 * Ignored head initializing event.
 *
 * @since 0.1.0
 * @category schemas
 */
export const IgnoredHeadInitializingMessageSchema = Schema.Struct({
  tag: Schema.Literal("IgnoredHeadInitializing"),
  headId: Schema.String,
  contestationPeriod: Schema.Int,
  parties: Schema.Array(PartySchema),
  participants: Schema.Array(Schema.String),
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type IgnoredHeadInitializingMessage =
  typeof IgnoredHeadInitializingMessageSchema.Type;

/**
 * Decommit invalid event.
 *
 * @since 0.1.0
 * @category schemas
 */
export const DecommitInvalidMessageSchema = Schema.Struct({
  tag: Schema.Literal("DecommitInvalid"),
  headId: Schema.String,
  decommitTx: Common.TransactionMessageSchema,
  decommitInvalidReason: Schema.Union(
    Schema.Struct({
      tag: Schema.Literal("DecommitTxInvalid"),
      localUTxO: UTxOSchema,
      validationError: Schema.Struct({
        reason: Schema.String,
      }),
    }),
    Schema.Struct({
      tag: Schema.Literal("DecommitAlreadyInFlight"),
      otherDecommitTxId: Schema.String,
    }),
  ),
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type DecommitInvalidMessage = typeof DecommitInvalidMessageSchema.Type;

/**
 * Decommit requested event.
 *
 * @since 0.1.0
 * @category schemas
 */
export const DecommitRequestedMessageSchema = Schema.Struct({
  tag: Schema.Literal("DecommitRequested"),
  headId: Schema.String,
  decommitTx: Common.TransactionMessageSchema,
  utxoToDecommit: UTxOSchema,
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type DecommitRequestedMessage =
  typeof DecommitRequestedMessageSchema.Type;

/**
 * Decommit approved event.
 *
 * @since 0.1.0
 * @category schemas
 */
export const DecommitApprovedMessageSchema = Schema.Struct({
  tag: Schema.Literal("DecommitApproved"),
  headId: Schema.String,
  decommitTxId: Schema.String,
  utxoToDecommit: UTxOSchema,
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type DecommitApprovedMessage = typeof DecommitApprovedMessageSchema.Type;

/**
 * Decommit finalized event.
 *
 * @since 0.1.0
 * @category schemas
 */
export const DecommitFinalizedMessageSchema = Schema.Struct({
  tag: Schema.Literal("DecommitFinalized"),
  headId: Schema.String,
  distributedUTxO: UTxOSchema,
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type DecommitFinalizedMessage =
  typeof DecommitFinalizedMessageSchema.Type;

/**
 * Commit recorded event (incremental deposit).
 *
 * @since 0.1.0
 * @category schemas
 */
export const CommitRecordedMessageSchema = Schema.Struct({
  tag: Schema.Literal("CommitRecorded"),
  headId: Schema.String,
  utxoToCommit: UTxOSchema,
  pendingDeposit: Schema.String,
  deadline: Schema.DateTimeUtc,
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type CommitRecordedMessage = typeof CommitRecordedMessageSchema.Type;

/**
 * Commit approved event (incremental deposit).
 *
 * @since 0.1.0
 * @category schemas
 */
export const CommitApprovedMessageSchema = Schema.Struct({
  tag: Schema.Literal("CommitApproved"),
  headId: Schema.String,
  utxoToCommit: UTxOSchema,
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type CommitApprovedMessage = typeof CommitApprovedMessageSchema.Type;

/**
 * Commit finalized event (incremental deposit).
 *
 * @since 0.1.0
 * @category schemas
 */
export const CommitFinalizedMessageSchema = Schema.Struct({
  tag: Schema.Literal("CommitFinalized"),
  headId: Schema.String,
  depositTxId: Schema.String,
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type CommitFinalizedMessage = typeof CommitFinalizedMessageSchema.Type;

/**
 * Commit recovered event.
 *
 * @since 0.1.0
 * @category schemas
 */
export const CommitRecoveredMessageSchema = Schema.Struct({
  tag: Schema.Literal("CommitRecovered"),
  headId: Schema.String,
  recoveredUTxO: UTxOSchema,
  recoveredTxId: Schema.String,
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type CommitRecoveredMessage = typeof CommitRecoveredMessageSchema.Type;

/**
 * Snapshot side-loaded event.
 *
 * @since 0.1.0
 * @category schemas
 */
export const SnapshotSideLoadedMessageSchema = Schema.Struct({
  tag: Schema.Literal("SnapshotSideLoaded"),
  headId: Schema.String,
  snapshotNumber: Schema.Int,
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type SnapshotSideLoadedMessage =
  typeof SnapshotSideLoadedMessageSchema.Type;

/**
 * Event log rotated event.
 *
 * @since 0.1.0
 * @category schemas
 */
export const EventLogRotatedMessageSchema = Schema.Struct({
  tag: Schema.Literal("EventLogRotated"),
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type EventLogRotatedMessage = typeof EventLogRotatedMessageSchema.Type;

/**
 * Deposit activated event (incremental commit).
 *
 * @since 0.2.0
 * @category schemas
 */
export const DepositActivatedMessageSchema = Schema.Struct({
  tag: Schema.Literal("DepositActivated"),
  headId: Schema.String,
  depositTxId: Schema.String,
  deadline: Schema.DateTimeUtc,
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type DepositActivatedMessage =
  typeof DepositActivatedMessageSchema.Type;

/**
 * Deposit expired event (incremental commit).
 *
 * @since 0.2.0
 * @category schemas
 */
export const DepositExpiredMessageSchema = Schema.Struct({
  tag: Schema.Literal("DepositExpired"),
  headId: Schema.String,
  depositTxId: Schema.String,
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type DepositExpiredMessage = typeof DepositExpiredMessageSchema.Type;

/**
 * Node unsynced event.
 *
 * @since 0.2.0
 * @category schemas
 */
export const NodeUnsyncedMessageSchema = Schema.Struct({
  tag: Schema.Literal("NodeUnsynced"),
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type NodeUnsyncedMessage = typeof NodeUnsyncedMessageSchema.Type;

/**
 * Node synced event.
 *
 * @since 0.2.0
 * @category schemas
 */
export const NodeSyncedMessageSchema = Schema.Struct({
  tag: Schema.Literal("NodeSynced"),
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type NodeSyncedMessage = typeof NodeSyncedMessageSchema.Type;

/**
 * Rejected input because node is unsynced event.
 *
 * @since 0.2.0
 * @category schemas
 */
export const RejectedInputBecauseUnsyncedMessageSchema = Schema.Struct({
  tag: Schema.Literal("RejectedInputBecauseUnsynced"),
  clientInput: Schema.Unknown,
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type RejectedInputBecauseUnsyncedMessage =
  typeof RejectedInputBecauseUnsyncedMessageSchema.Type;

/**
 * Snapshot side-load rejected event.
 *
 * @since 0.2.0
 * @category schemas
 */
export const SideLoadSnapshotRejectedMessageSchema = Schema.Struct({
  tag: Schema.Literal("SideLoadSnapshotRejected"),
  headId: Schema.String,
  seq: Schema.Int,
  timestamp: Schema.DateTimeUtc,
});
export type SideLoadSnapshotRejectedMessage =
  typeof SideLoadSnapshotRejectedMessageSchema.Type;

/**
 * Union of all possible WebSocket response message types from a Hydra node.
 *
 * @since 0.1.0
 * @category schemas
 */
export const WebSocketResponseMessageSchema = Schema.Union(
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
  DepositActivatedMessageSchema,
  DepositExpiredMessageSchema,
  NodeUnsyncedMessageSchema,
  NodeSyncedMessageSchema,
  RejectedInputBecauseUnsyncedMessageSchema,
  SideLoadSnapshotRejectedMessageSchema,
);
export type WebSocketResponseMessage =
  typeof WebSocketResponseMessageSchema.Type;

// =============================================================================
// HTTP API Response Schemas
// =============================================================================

/**
 * Response from the `/head` HTTP endpoint.
 *
 * @since 0.1.0
 * @category schemas
 */
export const HeadResponseSchema = Schema.Union(
  Schema.Struct({
    tag: Schema.Literal("Idle"),
    contents: Schema.Struct({
      chainState: Schema.String,
    }),
  }),
  Schema.Struct({
    tag: Schema.Literal("Initial"),
    contents: Schema.Struct({
      parameters: Schema.Struct({
        contestationPeriod: Schema.Int,
        parties: Schema.Array(PartySchema),
      }),
      pendingCommits: Schema.Array(PartySchema),
      commited: PartySchema,
      chainState: Schema.String,
      headId: Schema.String,
      headSeed: Schema.String,
    }),
  }),
  Schema.Struct({
    tag: Schema.Literal("Open"),
    contents: Schema.Struct({
      parameters: Schema.Struct({
        contestationPeriod: Schema.Int,
        parties: Schema.Array(PartySchema),
      }),
      coordinatedHeadState: Schema.Struct({
        localUTxO: UTxOSchema,
        localTxs: Common.TransactionMessageSchema,
        allTxs: Schema.Record({ key: Schema.String, value: Schema.Any }),
        confirmedSnapshot: Common.ConfirmedSnapshotSchema,
        seenSnapshot: Common.SeenSnapshotSchema,
        pendingDeposits: Schema.Record({
          key: Schema.String,
          value: Schema.Any,
        }),
        currentDepositTxId: Schema.Record({
          key: Schema.String,
          value: Schema.Any,
        }),
        decommitTx: Schema.NullOr(Common.TransactionMessageSchema),
        version: Schema.Int,
      }),
      chainState: Schema.String,
      headId: Schema.String,
      currentSlot: Schema.Int,
      headSeed: Schema.String,
    }),
  }),
  Schema.Struct({
    tag: Schema.Literal("Closed"),
    contents: Schema.Struct({
      parameters: Schema.Struct({
        contestationPeriod: Schema.Int,
        parties: Schema.Array(PartySchema),
      }),
      confirmedSnapshot: Common.ConfirmedSnapshotSchema,
      contestationDeadline: Schema.DateTimeUtc,
      readyToFanoutSent: Schema.Boolean,
      chainState: Schema.Any,
      headId: Schema.String,
      headSeed: Schema.String,
      version: Schema.Int,
    }),
  }),
);
export type HeadResponse = typeof HeadResponseSchema.Type;

/**
 * Response containing a single commit transaction.
 *
 * @since 0.1.0
 * @category schemas
 */
export const CommitResponseSchema = Common.TransactionMessageSchema;
export type CommitResponse = typeof CommitResponseSchema.Type;

/**
 * Response containing an array of commit transactions.
 *
 * @since 0.1.0
 * @category schemas
 */
export const CommitsResponseSchema = Schema.Array(
  Common.TransactionMessageSchema,
);
export type CommitsResponse = typeof CommitsResponseSchema.Type;

/**
 * The last seen snapshot that has been acknowledged but not yet confirmed.
 *
 * @since 0.1.0
 * @category schemas
 */
export const SnapshotLastSeenSchema = Common.SeenSnapshotSchema;
export type SnapshotLastSeen = typeof SnapshotLastSeenSchema.Type;

/**
 * The UTxO set from the current snapshot.
 *
 * @since 0.1.0
 * @category schemas
 */
export const SnapshotUTxOSchema = UTxOSchema;
export type SnapshotUTxO = typeof SnapshotUTxOSchema.Type;

/**
 * Response containing a confirmed snapshot with all transaction details.
 *
 * @since 0.1.0
 * @category schemas
 */
export const SnapshotResponseSchema = Common.ConfirmedSnapshotSchema;
export type SnapshotResponse = typeof SnapshotResponseSchema.Type;

/**
 * Cardano protocol parameters used by the Hydra Head.
 *
 * @since 0.1.0
 * @category schemas
 */
export const ProtocolParametersResponseSchema = Schema.Struct({
  protocolVersion: Schema.Struct({
    major: Schema.Int,
    minor: Schema.Int,
    patch: Schema.Int,
  }),
  maxBlockBodySize: Schema.Number,
  maxBlockHeaderSize: Schema.Number,
  maxTxSize: Schema.Number,
  txFeeFixed: Schema.Struct({
    lovelace: Schema.Int,
  }),
  txFeePerByte: Schema.Int,
  stakeAddressDeposit: Schema.Struct({
    lovelace: Schema.Int,
  }),
  stakePoolDeposit: Schema.Struct({
    lovelace: Schema.Int,
  }),
  minPoolCost: Schema.Struct({
    lovelace: Schema.Int,
  }),
  poolRetireMaxEpoch: Schema.Int,
  stakePoolTargetNum: Schema.Number,
  poolPledgeInfluence: Schema.Number,
  monetaryExpansion: Schema.Number,
  treasuryCut: Schema.Number,
  costModels: Schema.Struct({
    PlutusV1: Schema.Array(Schema.Int),
    PlutusV2: Schema.Array(Schema.Int),
    PlutusV3: Schema.Array(Schema.Int),
  }),
  executionUnitPrices: Schema.Any,
  maxTxExecutionUnits: Schema.Struct({
    memory: Schema.Number,
    cpu: Schema.Number,
  }),
  maxTxBlockExecutionUnits: Schema.Struct({
    memory: Schema.Number,
    cpu: Schema.Number,
  }),
  maxValueSize: Schema.Number,
  collateralPercentage: Schema.Number,
  maxCollateralInputs: Schema.Number,
  utxoConstPerByte: Schema.Struct({
    lovelace: Schema.Int,
  }),
});
export type ProtocolParametersResponse =
  typeof ProtocolParametersResponseSchema.Type;

/**
 * Response from the Cardano transaction endpoint.
 *
 * @since 0.1.0
 * @category schemas
 */
export const CardanoTransactionResponseSchema = Schema.Union(
  Schema.Struct({
    tag: Schema.Literal("TransactionSubmitted"),
  }),
  Schema.Struct({
    tag: Schema.Literal("ScriptFailedInWallet"),
    redeemerPtr: Schema.String,
    failureReason: Schema.String,
    failingTx: Common.TransactionMessageSchema,
  }),
  Schema.Struct({
    tag: Schema.Literal("InternalWalletError"),
    failingTx: Common.TransactionMessageSchema,
    failure: Schema.String,
    headUTxO: Schema.String,
  }),
  Schema.Struct({
    tag: Schema.Literal("NoFuelUTXOFound"),
    failingTx: Common.TransactionMessageSchema,
  }),
  Schema.Struct({
    tag: Schema.Literal("CannotFindOwnInitial"),
    knownUTxO: Schema.String,
  }),
  Schema.Struct({
    tag: Schema.Literal("UnsupportedLegacyOutput"),
    byronAddress: Schema.String,
  }),
  Schema.Struct({
    tag: Schema.Literal("NoSeedInput"),
  }),
  Schema.Struct({
    tag: Schema.Literal("InvalidStateToPost"),
    chainState: Schema.Any,
    txTried: Schema.Any, // I am not parsing all of that
  }),
  Schema.Struct({
    tag: Schema.Literal("FailedToPostTx"),
    failureReason: Schema.String,
    failingTx: Common.TransactionMessageSchema,
  }),
  Schema.Struct({
    tag: Schema.Literal("CommittedTooMuchADAForMainnet"),
    userCommittedLovelace: Schema.Int,
    mainnetLimitLovelace: Schema.Int,
  }),
  Schema.Struct({
    tag: Schema.Literal("FailedToDraftTxNotInitializing"),
  }),
  Schema.Struct({
    tag: Schema.Literal("InvalidSeed"),
    headSeed: Schema.String,
  }),
  Schema.Struct({
    tag: Schema.Literal("InvalidHeadId"),
    headId: Schema.String,
  }),
  Schema.Struct({
    tag: Schema.Literal("FailedToConstructAbortTx"),
  }),
  Schema.Struct({
    tag: Schema.Literal("FailedToConstructCloseTx"),
  }),
  Schema.Struct({
    tag: Schema.Literal("FailedToConstructContestTx"),
  }),
  Schema.Struct({
    tag: Schema.Literal("FailedToConstructCollectTx"),
  }),
  Schema.Struct({
    tag: Schema.Literal("FailedToConstructDepositTx"),
  }),
  Schema.Struct({
    tag: Schema.Literal("FailedToConstructRecoverTx"),
  }),
  Schema.Struct({
    tag: Schema.Literal("FailedToConstructIncrementTx"),
  }),
  Schema.Struct({
    tag: Schema.Literal("FailedToConstructDecrementTx"),
  }),
  Schema.Struct({
    tag: Schema.Literal("FailedToConstructFanoutTx"),
  }),
);
export type CardanoTransactionResponse =
  typeof CardanoTransactionResponseSchema.Type;
