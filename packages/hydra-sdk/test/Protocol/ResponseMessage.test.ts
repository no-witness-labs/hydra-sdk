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
        snapshotUtxo: "{\n    \"09d34606abdcd0b10ebc89307cbfa0b469f9144194137b45b7a04b273961add8#687\": {\n        \"address\": \"addr1w9htvds89a78ex2uls5y969ttry9s3k9etww0staxzndwlgmzuul5\",\n        \"value\": {\n            \"lovelace\": 7620669\n        }\n    }\n}\n",
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
            parties: [{ vkey: "d0b8f28427aa7b640c636075905cbd6574a431aeaca5b3dbafd47cfe66c35043" }]
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
        headId: "820082582089ff4f3ff4a6052ec9d073",
        parties: [{ vkey: "d0b8f28427aa7b640c636075905cbd6574a431aeaca5b3dbafd47cfe66c35043" }],
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
        headId: "820082582089ff4f3ff4a6052ec9d073",
        parties: [{ vkey: "d0b8f28427aa7b640c636075905cbd6574a431aeaca5b3dbafd47cfe66c35043" }],
        utxo: "{\n    \"09d34606abdcd0b10ebc89307cbfa0b469f9144194137b45b7a04b273961add8#687\": {\n        \"address\": \"addr1w9htvds89a78ex2uls5y969ttry9s3k9etww0staxzndwlgmzuul5\",\n        \"value\": {\n            \"lovelace\": 7620669\n        }\n    }\n}\n",
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
        headId: "820082582089ff4f3ff4a6052ec9d073",
        utxo: "{\n    \"09d34606abdcd0b10ebc89307cbfa0b469f9144194137b45b7a04b273961add8#687\": {\n        \"address\": \"addr1w9htvds89a78ex2uls5y969ttry9s3k9etww0staxzndwlgmzuul5\",\n        \"value\": {\n            \"lovelace\": 7620669\n        }\n    }\n}\n",
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
        headId: "820082582089ff4f3ff4a6052ec9d073",
        snapshotNumber: 5,
        contestationDeadline: "2019-08-24T14:15:22Z",
        utxo: "{\n    \"09d34606abdcd0b10ebc89307cbfa0b469f9144194137b45b7a04b273961add8#687\": {\n        \"address\": \"addr1w9htvds89a78ex2uls5y969ttry9s3k9etww0staxzndwlgmzuul5\",\n        \"value\": {\n            \"lovelace\": 7620669\n        }\n    }\n}\n",
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
        headId: "820082582089ff4f3ff4a6052ec9d073",
        snapshotNumber: 5,
        contestationDeadline: "2019-08-24T14:15:22Z",
        utxo: "{\n    \"09d34606abdcd0b10ebc89307cbfa0b469f9144194137b45b7a04b273961add8#687\": {\n        \"address\": \"addr1w9htvds89a78ex2uls5y969ttry9s3k9etww0staxzndwlgmzuul5\",\n        \"value\": {\n            \"lovelace\": 7620669\n        }\n    }\n}\n",
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
        headId: "820082582089ff4f3ff4a6052ec9d073",
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
        headId: "820082582089ff4f3ff4a6052ec9d073",
        utxo: "{\n    \"09d34606abdcd0b10ebc89307cbfa0b469f9144194137b45b7a04b273961add8#687\": {\n        \"address\": \"addr1w9htvds89a78ex2uls5y969ttry9s3k9etww0staxzndwlgmzuul5\",\n        \"value\": {\n            \"lovelace\": 7620669\n        }\n    }\n}\n",
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
        headId: "820082582089ff4f3ff4a6052ec9d073",
        utxo: "{\n    \"09d34606abdcd0b10ebc89307cbfa0b469f9144194137b45b7a04b273961add8#687\": {\n        \"address\": \"addr1w9htvds89a78ex2uls5y969ttry9s3k9etww0staxzndwlgmzuul5\",\n        \"value\": {\n            \"lovelace\": 7620669\n        }\n    }\n}\n",
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
        headId: "820082582089ff4f3ff4a6052ec9d073",
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
        headId: "820082582089ff4f3ff4a6052ec9d073",
        utxo: "{\n    \"09d34606abdcd0b10ebc89307cbfa0b469f9144194137b45b7a04b273961add8#687\": {\n        \"address\": \"addr1w9htvds89a78ex2uls5y969ttry9s3k9etww0staxzndwlgmzuul5\",\n        \"value\": {\n            \"lovelace\": 7620669\n        }\n    }\n}\n",
        transaction: {
          txId: "8df1616d4337ede40bbad2914f12977815234b83951bcce3bfcd735aed3f63e4",
          type: "Tx ConwayEra",
          description: "",
          cborHex: "820082582089ff4f3ff4a6052ec9d073b3be68b5e7596bd74a04e7b74504a8302fb2278cd95840f66eb3cd160372d617411408792c0ebd9791968e9948112894e2706697a55c10296b04019ed2f146f4d81e8ab17b9d14cf99569a2f85cbfa32320127831db202"
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
        headId: "820082582089ff4f3ff4a6052ec9d073",
        snapshot: {
          headId: "820082582089ff4f3ff4a6052ec9d073",
          version: 1,
          number: 5,
          confirmed: [],
          utxo: "{\n    \"09d34606abdcd0b10ebc89307cbfa0b469f9144194137b45b7a04b273961add8#687\": {\n        \"address\": \"addr1w9htvds89a78ex2uls5y969ttry9s3k9etww0staxzndwlgmzuul5\",\n        \"value\": {\n            \"lovelace\": 7620669\n        }\n    }\n}\n"
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
        headId: "820082582089ff4f3ff4a6052ec9d073",
        contestationPeriod: 100,
        parties: [{ vkey: "d0b8f28427aa7b640c636075905cbd6574a431aeaca5b3dbafd47cfe66c35043" }],
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
        headId: "820082582089ff4f3ff4a6052ec9d073",
        decommitTx: {
          txId: "8df1616d4337ede40bbad2914f12977815234b83951bcce3bfcd735aed3f63e4",
          type: "Tx ConwayEra",
          description: "",
          cborHex: "820082582089ff4f3ff4a6052ec9d073b3be68b5e7596bd74a04e7b74504a8302fb2278cd95840f66eb3cd160372d617411408792c0ebd9791968e9948112894e2706697a55c10296b04019ed2f146f4d81e8ab17b9d14cf99569a2f85cbfa32320127831db202"
        },
        decommitInvalidReason: {
          tag: "DecommitTxInvalid",
          localUTxO: "{\n    \"09d34606abdcd0b10ebc89307cbfa0b469f9144194137b45b7a04b273961add8#687\": {\n        \"address\": \"addr1w9htvds89a78ex2uls5y969ttry9s3k9etww0staxzndwlgmzuul5\",\n        \"value\": {\n            \"lovelace\": 7620669\n        }\n    }\n}\n",
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
        headId: "820082582089ff4f3ff4a6052ec9d073",
        decommitTx: {
          txId: "8df1616d4337ede40bbad2914f12977815234b83951bcce3bfcd735aed3f63e4",
          type: "Tx ConwayEra",
          description: "",
          cborHex: "820082582089ff4f3ff4a6052ec9d073b3be68b5e7596bd74a04e7b74504a8302fb2278cd95840f66eb3cd160372d617411408792c0ebd9791968e9948112894e2706697a55c10296b04019ed2f146f4d81e8ab17b9d14cf99569a2f85cbfa32320127831db202"
        },
        decommitInvalidReason: {
          tag: "DecommitAlreadyInFlight",
          otherDecommitTxId: "8df1616d4337ede40bbad2914f12977815234b83951bcce3bfcd735aed3f63e4"
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
        headId: "820082582089ff4f3ff4a6052ec9d073",
        decommitTx: {
          txId: "8df1616d4337ede40bbad2914f12977815234b83951bcce3bfcd735aed3f63e4",
          type: "Tx ConwayEra",
          description: "",
          cborHex: "820082582089ff4f3ff4a6052ec9d073b3be68b5e7596bd74a04e7b74504a8302fb2278cd95840f66eb3cd160372d617411408792c0ebd9791968e9948112894e2706697a55c10296b04019ed2f146f4d81e8ab17b9d14cf99569a2f85cbfa32320127831db202"
        },
        utxoToDecommit: "{\n    \"09d34606abdcd0b10ebc89307cbfa0b469f9144194137b45b7a04b273961add8#687\": {\n        \"address\": \"addr1w9htvds89a78ex2uls5y969ttry9s3k9etww0staxzndwlgmzuul5\",\n        \"value\": {\n            \"lovelace\": 7620669\n        }\n    }\n}\n",
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
        headId: "820082582089ff4f3ff4a6052ec9d073",
        decommitTxId: "8df1616d4337ede40bbad2914f12977815234b83951bcce3bfcd735aed3f63e4",
        utxoToDecommit: "{\n    \"09d34606abdcd0b10ebc89307cbfa0b469f9144194137b45b7a04b273961add8#687\": {\n        \"address\": \"addr1w9htvds89a78ex2uls5y969ttry9s3k9etww0staxzndwlgmzuul5\",\n        \"value\": {\n            \"lovelace\": 7620669\n        }\n    }\n}\n",
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
        headId: "820082582089ff4f3ff4a6052ec9d073",
        distributedUTxO: "{\n    \"09d34606abdcd0b10ebc89307cbfa0b469f9144194137b45b7a04b273961add8#687\": {\n        \"address\": \"addr1w9htvds89a78ex2uls5y969ttry9s3k9etww0staxzndwlgmzuul5\",\n        \"value\": {\n            \"lovelace\": 7620669\n        }\n    }\n}\n",
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
        headId: "820082582089ff4f3ff4a6052ec9d073",
        utxoToCommit: "{\n    \"09d34606abdcd0b10ebc89307cbfa0b469f9144194137b45b7a04b273961add8#687\": {\n        \"address\": \"addr1w9htvds89a78ex2uls5y969ttry9s3k9etww0staxzndwlgmzuul5\",\n        \"value\": {\n            \"lovelace\": 7620669\n        }\n    }\n}\n",
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
        headId: "820082582089ff4f3ff4a6052ec9d073",
        utxoToCommit: "{\n    \"09d34606abdcd0b10ebc89307cbfa0b469f9144194137b45b7a04b273961add8#687\": {\n        \"address\": \"addr1w9htvds89a78ex2uls5y969ttry9s3k9etww0staxzndwlgmzuul5\",\n        \"value\": {\n            \"lovelace\": 7620669\n        }\n    }\n}\n",
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
        headId: "820082582089ff4f3ff4a6052ec9d073",
        depositTxId: "8df1616d4337ede40bbad2914f12977815234b83951bcce3bfcd735aed3f63e4",
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
        headId: "820082582089ff4f3ff4a6052ec9d073",
        recoveredUTxO: "{\n    \"09d34606abdcd0b10ebc89307cbfa0b469f9144194137b45b7a04b273961add8#687\": {\n        \"address\": \"addr1w9htvds89a78ex2uls5y969ttry9s3k9etww0staxzndwlgmzuul5\",\n        \"value\": {\n            \"lovelace\": 7620669\n        }\n    }\n}\n",
        recoveredTxId: "8df1616d4337ede40bbad2914f12977815234b83951bcce3bfcd735aed3f63e4",
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
        headId: "820082582089ff4f3ff4a6052ec9d073",
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
        me: { vkey: "d0b8f28427aa7b640c636075905cbd6574a431aeaca5b3dbafd47cfe66c35043" },
        headStatus: "Idle",
        hydraHeadId: "820082582089ff4f3ff4a6052ec9d073",
        snapshotUtxo: "{\n    \"09d34606abdcd0b10ebc89307cbfa0b469f9144194137b45b7a04b273961add8#687\": {\n        \"address\": \"addr1w9htvds89a78ex2uls5y969ttry9s3k9etww0staxzndwlgmzuul5\",\n        \"value\": {\n            \"lovelace\": 7620669\n        }\n    }\n}\n",
        timestamp: "2019-08-24T14:15:22Z",
        hydraNodeVersion: "1.0.0"
      };

      yield* Schema.decodeUnknown(ResponseMessageSchema)(greetingsInput);

      const txValidInput = {
        tag: "TxValid",
        headId: "820082582089ff4f3ff4a6052ec9d073",
        transactionId: "tx123",
        seq: 1,
        timestamp: "2019-08-24T14:15:22Z"
      };

      yield* Schema.decodeUnknown(ResponseMessageSchema)(txValidInput);
    })
  );
});
