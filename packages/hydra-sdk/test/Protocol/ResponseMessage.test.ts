import { describe, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import {
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
  ResponseMessageSchema,
} from "@no-witness-labs/hydra-sdk";

describe("GreetingsMessageSchema", () => {
  it.effect("validates a correct Greetings message", () =>
    Effect.gen(function* () {
      const input = {
        tag: "Greetings",
        me: { vkey: "d0b8f28427aa7b640c636075905cbd6574a431aeaca5b3dbafd47cfe66c35043" },
        headStatus: "Idle",
        hydraHeadId: "820082582089ff4f3ff4a6052ec9d073",
        snapshotUtxo: "{}",
        timestamp: "2019-08-24T14:15:22Z",
        hydraNodeVersion: "1.0.0"
      };

      yield* Schema.decodeUnknown(GreetingsMessageSchema)(input);
    })
  );
});

describe("CommandFailedMessageSchema", () => {
  it.effect("validates a correct CommandFailed message", () =>
    Effect.gen(function* () {
      const input = {
        tag: "CommandFailed",
        clientInput: { tag: "Init" }
      };

      yield* Schema.decodeUnknown(CommandFailedMessageSchema)(input);
    })
  );
});

describe("PostTxOnChainFailedMessageSchema", () => {
  it.effect("validates a correct PostTxOnChainFailed message", () =>
    Effect.gen(function* () {
      const input = {
        tag: "PostTxOnChainFailed",
        postChainTx: {
          tag: "InitTx",
          participants: ["alice"],
          headParameters: {
            contestationPeriod: 100,
            parties: [{ vkey: "abc" }]
          }
        },
        postTxError: { error: "test" }
      };

      yield* Schema.decodeUnknown(PostTxOnChainFailedMessageSchema)(input);
    })
  );
});

describe("PeerConnectedMessageSchema", () => {
  it.effect("validates a correct PeerConnected message", () =>
    Effect.gen(function* () {
      const input = {
        tag: "PeerConnected",
        peer: { hostname: "localhost", port: 5001 },
        seq: 1,
        timestamp: "2019-08-24T14:15:22Z"
      };

      yield* Schema.decodeUnknown(PeerConnectedMessageSchema)(input);
    })
  );
});

describe("PeerDisconnectedMessageSchema", () => {
  it.effect("validates a correct PeerDisconnected message", () =>
    Effect.gen(function* () {
      const input = {
        tag: "PeerDisconnected",
        peer: { hostname: "localhost", port: 5001 },
        seq: 1,
        timestamp: "2019-08-24T14:15:22Z"
      };

      yield* Schema.decodeUnknown(PeerDisconnectedMessageSchema)(input);
    })
  );
});

describe("NetworkConnectedMessageSchema", () => {
  it.effect("validates a correct NetworkConnected message", () =>
    Effect.gen(function* () {
      const input = {
        tag: "NetworkConnected",
        seq: 1,
        timestamp: "2019-08-24T14:15:22Z"
      };

      yield* Schema.decodeUnknown(NetworkConnectedMessageSchema)(input);
    })
  );
});

describe("NetworkDisconnectedMessageSchema", () => {
  it.effect("validates a correct NetworkDisconnected message", () =>
    Effect.gen(function* () {
      const input = {
        tag: "NetworkDisconnected",
        seq: 1,
        timestamp: "2019-08-24T14:15:22Z"
      };

      yield* Schema.decodeUnknown(NetworkDisconnectedMessageSchema)(input);
    })
  );
});

describe("NetworkVersionMismatchMessageSchema", () => {
  it.effect("validates a correct NetworkVersionMismatch message", () =>
    Effect.gen(function* () {
      const input = {
        tag: "NetworkVersionMismatch",
        ourVersion: 1,
        theirVersion: 2,
        seq: 1,
        timestamp: "2019-08-24T14:15:22Z"
      };

      yield* Schema.decodeUnknown(NetworkVersionMismatchMessageSchema)(input);
    })
  );

  it.effect("validates with null ourVersion", () =>
    Effect.gen(function* () {
      const input = {
        tag: "NetworkVersionMismatch",
        ourVersion: null,
        theirVersion: 2,
        seq: 1,
        timestamp: "2019-08-24T14:15:22Z"
      };

      yield* Schema.decodeUnknown(NetworkVersionMismatchMessageSchema)(input);
    })
  );
});

describe("NetworkClusterIDMismatchMessageSchema", () => {
  it.effect("validates a correct NetworkClusterIDMismatch message", () =>
    Effect.gen(function* () {
      const input = {
        tag: "NetworkClusterIDMismatch",
        clusterPeers: "peer1,peer2",
        misconfiguredPeers: "peer3",
        seq: 1,
        timestamp: "2019-08-24T14:15:22Z"
      };

      yield* Schema.decodeUnknown(NetworkClusterIDMismatchMessageSchema)(input);
    })
  );
});

describe("HeadIsInitializingMessageSchema", () => {
  it.effect("validates a correct HeadIsInitializing message", () =>
    Effect.gen(function* () {
      const input = {
        tag: "HeadIsInitializing",
        headId: "head1",
        parties: [{ vkey: "abc" }],
        seq: 1,
        timestamp: "2019-08-24T14:15:22Z"
      };

      yield* Schema.decodeUnknown(HeadIsInitializingMessageSchema)(input);
    })
  );
});

describe("CommittedMessageSchema", () => {
  it.effect("validates a correct Committed message", () =>
    Effect.gen(function* () {
      const input = {
        tag: "Committed",
        headId: "head1",
        parties: [{ vkey: "abc" }],
        utxo: "{}",
        seq: 1,
        timestamp: "2019-08-24T14:15:22Z"
      };

      yield* Schema.decodeUnknown(CommittedMessageSchema)(input);
    })
  );
});

describe("HeadIsOpenMessageSchema", () => {
  it.effect("validates a correct HeadIsOpen message", () =>
    Effect.gen(function* () {
      const input = {
        tag: "HeadIsOpen",
        headId: "head1",
        utxo: "{}",
        seq: 1,
        timestamp: "2019-08-24T14:15:22Z"
      };

      yield* Schema.decodeUnknown(HeadIsOpenMessageSchema)(input);
    })
  );
});

describe("HeadIsClosedMessageSchema", () => {
  it.effect("validates a correct HeadIsClosed message", () =>
    Effect.gen(function* () {
      const input = {
        tag: "HeadIsClosed",
        headId: "head1",
        snapshotNumber: 5,
        contestationDeadline: "2019-08-24T14:15:22Z",
        utxo: "{}",
        seq: 1,
        timestamp: "2019-08-24T14:15:22Z"
      };

      yield* Schema.decodeUnknown(HeadIsClosedMessageSchema)(input);
    })
  );
});

describe("HeadIsContestedMessageSchema", () => {
  it.effect("validates a correct HeadIsContested message", () =>
    Effect.gen(function* () {
      const input = {
        tag: "HeadIsContested",
        headId: "head1",
        snapshotNumber: 5,
        contestationDeadline: "2019-08-24T14:15:22Z",
        utxo: "{}",
        seq: 1,
        timestamp: "2019-08-24T14:15:22Z"
      };

      yield* Schema.decodeUnknown(HeadIsContestedMessageSchema)(input);
    })
  );
});

describe("ReadyToFanoutMessageSchema", () => {
  it.effect("validates a correct ReadyToFanout message", () =>
    Effect.gen(function* () {
      const input = {
        tag: "ReadyToFanout",
        headId: "head1",
        seq: 1,
        timestamp: "2019-08-24T14:15:22Z"
      };

      yield* Schema.decodeUnknown(ReadyToFanoutMessageSchema)(input);
    })
  );
});

describe("HeadIsAbortedMessageSchema", () => {
  it.effect("validates a correct HeadIsAborted message", () =>
    Effect.gen(function* () {
      const input = {
        tag: "HeadIsAborted",
        headId: "head1",
        utxo: "{}",
        seq: 1,
        timestamp: "2019-08-24T14:15:22Z"
      };

      yield* Schema.decodeUnknown(HeadIsAbortedMessageSchema)(input);
    })
  );
});

describe("HeadIsFinalizedMessageSchema", () => {
  it.effect("validates a correct HeadIsFinalized message", () =>
    Effect.gen(function* () {
      const input = {
        tag: "HeadIsFinalized",
        headId: "head1",
        utxo: "{}",
        seq: 1,
        timestamp: "2019-08-24T14:15:22Z"
      };

      yield* Schema.decodeUnknown(HeadIsFinalizedMessageSchema)(input);
    })
  );
});

describe("TxValidMessageSchema", () => {
  it.effect("validates a correct TxValid message", () =>
    Effect.gen(function* () {
      const input = {
        tag: "TxValid",
        headId: "head1",
        transactionId: "tx123",
        seq: 1,
        timestamp: "2019-08-24T14:15:22Z"
      };

      yield* Schema.decodeUnknown(TxValidMessageSchema)(input);
    })
  );
});

describe("TxInvalidMessageSchema", () => {
  it.effect("validates a correct TxInvalid message", () =>
    Effect.gen(function* () {
      const input = {
        tag: "TxInvalid",
        headId: "head1",
        utxo: "{}",
        transaction: {
          txId: "tx123",
          type: "Tx ConwayEra",
          description: "",
          cborHex: "84a300"
        },
        validationError: { reason: "Invalid signature" },
        seq: 1,
        timestamp: "2019-08-24T14:15:22Z"
      };

      yield* Schema.decodeUnknown(TxInvalidMessageSchema)(input);
    })
  );
});

describe("SnapshotConfirmedMessageSchema", () => {
  it.effect("validates a correct SnapshotConfirmed message", () =>
    Effect.gen(function* () {
      const input = {
        tag: "SnapshotConfirmed",
        headId: "head1",
        snapshot: {
          headId: "head1",
          version: 1,
          number: 5,
          confirmed: [],
          utxo: "{}"
        },
        seq: 1,
        timestamp: "2019-08-24T14:15:22Z"
      };

      yield* Schema.decodeUnknown(SnapshotConfirmedMessageSchema)(input);
    })
  );
});

describe("InvalidInputMessageSchema", () => {
  it.effect("validates a correct InvalidInput message", () =>
    Effect.gen(function* () {
      const input = {
        tag: "InvalidInput",
        reason: "Malformed JSON",
        input: "invalid data"
      };

      yield* Schema.decodeUnknown(InvalidInputMessageSchema)(input);
    })
  );
});

describe("IgnoredHeadInitializingMessageSchema", () => {
  it.effect("validates a correct IgnoredHeadInitializing message", () =>
    Effect.gen(function* () {
      const input = {
        tag: "IgnoredHeadInitializing",
        headId: "head1",
        contestationPeriod: 100,
        parties: [{ vkey: "abc" }],
        participants: ["alice"],
        seq: 1,
        timestamp: "2019-08-24T14:15:22Z"
      };

      yield* Schema.decodeUnknown(IgnoredHeadInitializingMessageSchema)(input);
    })
  );
});

describe("DecommitInvalidMessageSchema", () => {
  it.effect("validates DecommitInvalid with DecommitTxInvalid reason", () =>
    Effect.gen(function* () {
      const input = {
        tag: "DecommitInvalid",
        headId: "head1",
        decommitTx: {
          txId: "tx123",
          type: "Tx ConwayEra",
          description: "",
          cborHex: "84a300"
        },
        decommitInvalidReason: {
          tag: "DecommitTxInvalid",
          localUTxO: "{}",
          validationError: { reason: "Invalid" }
        },
        seq: 1,
        timestamp: "2019-08-24T14:15:22Z"
      };

      yield* Schema.decodeUnknown(DecommitInvalidMessageSchema)(input);
    })
  );

  it.effect("validates DecommitInvalid with DecommitAlreadyInFlight reason", () =>
    Effect.gen(function* () {
      const input = {
        tag: "DecommitInvalid",
        headId: "head1",
        decommitTx: {
          txId: "tx123",
          type: "Tx ConwayEra",
          description: "",
          cborHex: "84a300"
        },
        decommitInvalidReason: {
          tag: "DecommitAlreadyInFlight",
          otherDecommitTxId: "tx456"
        },
        seq: 1,
        timestamp: "2019-08-24T14:15:22Z"
      };

      yield* Schema.decodeUnknown(DecommitInvalidMessageSchema)(input);
    })
  );
});

describe("DecommitRequestedMessageSchema", () => {
  it.effect("validates a correct DecommitRequested message", () =>
    Effect.gen(function* () {
      const input = {
        tag: "DecommitRequested",
        headId: "head1",
        decommitTx: {
          txId: "tx123",
          type: "Tx ConwayEra",
          description: "",
          cborHex: "84a300"
        },
        utxoToDecommit: "{}",
        seq: 1,
        timestamp: "2019-08-24T14:15:22Z"
      };

      yield* Schema.decodeUnknown(DecommitRequestedMessageSchema)(input);
    })
  );
});

describe("DecommitApprovedMessageSchema", () => {
  it.effect("validates a correct DecommitApproved message", () =>
    Effect.gen(function* () {
      const input = {
        tag: "DecommitApproved",
        headId: "head1",
        decommitTxId: "tx123",
        utxoToDecommit: "{}",
        seq: 1,
        timestamp: "2019-08-24T14:15:22Z"
      };

      yield* Schema.decodeUnknown(DecommitApprovedMessageSchema)(input);
    })
  );
});

describe("DecommitFinalizedMessageSchema", () => {
  it.effect("validates a correct DecommitFinalized message", () =>
    Effect.gen(function* () {
      const input = {
        tag: "DecommitFinalized",
        headId: "head1",
        distributedUTxO: "{}",
        seq: 1,
        timestamp: "2019-08-24T14:15:22Z"
      };

      yield* Schema.decodeUnknown(DecommitFinalizedMessageSchema)(input);
    })
  );
});

describe("CommitRecordedMessageSchema", () => {
  it.effect("validates a correct CommitRecorded message", () =>
    Effect.gen(function* () {
      const input = {
        tag: "CommitRecorded",
        headId: "head1",
        utxoToCommit: "{}",
        pendingDeposit: "deposit1",
        deadline: "2019-08-24T14:15:22Z",
        seq: 1,
        timestamp: "2019-08-24T14:15:22Z"
      };

      yield* Schema.decodeUnknown(CommitRecordedMessageSchema)(input);
    })
  );
});

describe("CommitApprovedMessageSchema", () => {
  it.effect("validates a correct CommitApproved message", () =>
    Effect.gen(function* () {
      const input = {
        tag: "CommitApproved",
        headId: "head1",
        utxoToCommit: "{}",
        seq: 1,
        timestamp: "2019-08-24T14:15:22Z"
      };

      yield* Schema.decodeUnknown(CommitApprovedMessageSchema)(input);
    })
  );
});

describe("CommitFinalizedMessageSchema", () => {
  it.effect("validates a correct CommitFinalized message", () =>
    Effect.gen(function* () {
      const input = {
        tag: "CommitFinalized",
        headId: "head1",
        depositTxId: "tx123",
        seq: 1,
        timestamp: "2019-08-24T14:15:22Z"
      };

      yield* Schema.decodeUnknown(CommitFinalizedMessageSchema)(input);
    })
  );
});

describe("CommitRecoveredMessageSchema", () => {
  it.effect("validates a correct CommitRecovered message", () =>
    Effect.gen(function* () {
      const input = {
        tag: "CommitRecovered",
        headId: "head1",
        recoveredUTxO: "{}",
        recoveredTxId: "tx123",
        seq: 1,
        timestamp: "2019-08-24T14:15:22Z"
      };

      yield* Schema.decodeUnknown(CommitRecoveredMessageSchema)(input);
    })
  );
});

describe("SnapshotSideLoadedMessageSchema", () => {
  it.effect("validates a correct SnapshotSideLoaded message", () =>
    Effect.gen(function* () {
      const input = {
        tag: "SnapshotSideLoaded",
        headId: "head1",
        snapshotNumber: 5,
        seq: 1,
        timestamp: "2019-08-24T14:15:22Z"
      };

      yield* Schema.decodeUnknown(SnapshotSideLoadedMessageSchema)(input);
    })
  );
});

describe("EventLogRotatedMessageSchema", () => {
  it.effect("validates a correct EventLogRotated message", () =>
    Effect.gen(function* () {
      const input = {
        tag: "EventLogRotated",
        seq: 1,
        timestamp: "2019-08-24T14:15:22Z"
      };

      yield* Schema.decodeUnknown(EventLogRotatedMessageSchema)(input);
    })
  );
});

describe("ResponseMessageSchema", () => {
  it.effect("validates a union of different message types", () =>
    Effect.gen(function* () {
      const greetingsInput = {
        tag: "Greetings",
        me: { vkey: "abc" },
        headStatus: "Idle",
        hydraHeadId: "head1",
        snapshotUtxo: "{}",
        timestamp: "2019-08-24T14:15:22Z",
        hydraNodeVersion: "1.0.0"
      };

      yield* Schema.decodeUnknown(ResponseMessageSchema)(greetingsInput);

      const txValidInput = {
        tag: "TxValid",
        headId: "head1",
        transactionId: "tx123",
        seq: 1,
        timestamp: "2019-08-24T14:15:22Z"
      };

      yield* Schema.decodeUnknown(ResponseMessageSchema)(txValidInput);
    })
  );
});
