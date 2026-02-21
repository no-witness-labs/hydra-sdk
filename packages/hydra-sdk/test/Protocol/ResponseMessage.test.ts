import { describe, expect, it } from "@effect/vitest";
import { Protocol } from "@no-witness-labs/hydra-sdk";
import { Effect, Schema } from "effect";

describe("GreetingsMessageSchema", () => {
  it.effect(
    "encodes reduced GreetingsMessageSchema to correct JSON object",
    () =>
      Effect.gen(function* () {
        const expected = {
          me: {
            vkey: "41c3b71ac178ba33e59506a792679d5cdd6efe9a1f474a53f13f7dde16b35eb6",
          },
          headStatus: "Idle",
          hydraNodeVersion: "1.0.0",
        };

        const decoded = yield* Schema.decodeUnknown(
          Protocol.GreetingsMessageSchema,
        )(expected);
        const encoded = yield* Schema.encode(Protocol.GreetingsMessageSchema)(
          decoded,
        );

        expect(encoded).toEqual(expected);
      }),
  );
  it.effect(
    "encodes GreetingsMessageSchema with peers to correct JSON object",
    () =>
      Effect.gen(function* () {
        const expected = {
          "env":{
            "configuredPeers":"172.16.238.10:5001=http://172.16.238.10:5001,172.16.238.20:5001=http://172.16.238.20:5001",
            "contestationPeriod":3,
            "depositPeriod":3600,
            "otherParties": [{"vkey":"b37aabd81024c043f53a069c91e51a5b52e4ea399ae17ee1fe3cb9c44db707eb"},{"vkey":"f68e5624f885d521d2f43c3959a0de70496d5464bd3171aba8248f50d5d72b41"}],
            "participants": ["3aaa2e3de913b0f5aa7e7f076e122d737db5329df1aa905192284fea","f8a68cd18e59a6ace848155a0e967af64f4d00cf8acee8adc95a6b0d","1052386136b347f3bb7c67fe3f2ee4ef120e1836e5d2707bb068afa6"],
            "party": {"vkey":"7abcda7de6d883e7570118c1ccc8ee2e911f2e628a41ab0685ffee15f39bba96"},
            "signingKey": "0e3f3546a93bd1295eb9dce216941eefbce99ca9323df258d9beeee335920cce"
          },
          "headStatus": "Open",
          "hydraHeadId": "564a742e347cc0d9db8aa6c083dfd1d2807186f3ea56e4536cefadc7",
          "hydraNodeVersion": "1.2.0-d967d641c0ccad884aff6187b4d1d6c8d92380dc",
          "me" :{"vkey":"7abcda7de6d883e7570118c1ccc8ee2e911f2e628a41ab0685ffee15f39bba96"},
          "networkInfo": {
            "networkConnected":true,
            "peersInfo": {"172.16.238.10:5001":true,"172.16.238.20:5001":true}
          },
            "snapshotUtxo":{},
            "tag":"Greetings"
        };

        const decoded = yield* Schema.decodeUnknown(
          Protocol.GreetingsMessageSchema,
        )(expected);
        const encoded = yield* Schema.encode(Protocol.GreetingsMessageSchema)(
          decoded,
        );

        expect(encoded).toEqual(expected);
      }),
  );
  it.effect("encodes GreetingsMessageSchema to correct JSON object", () =>
    Effect.gen(function* () {
      const expected = {
        tag: "Greetings",
        me: {
          vkey: "d0b8f28427aa7b640c636075905cbd6574a431aeaca5b3dbafd47cfe66c35043",
        },
        headStatus: "Idle",
        hydraHeadId: "820082582089ff4f3ff4a6052ec9d073",
        snapshotUtxo: {
          "09d34606abdcd0b10ebc89307cbfa0b469f9144194137b45b7a04b273961add8#687": {
            "address": "addr1w9htvds89a78ex2uls5y969ttry9s3k9etww0staxzndwlgmzuul5",
            "value": {
              "lovelace": 7620669
            }
          }
        },
        timestamp: "2019-08-24T14:15:22.000Z",
        hydraNodeVersion: "1.0.0",
      };

      const decoded = yield* Schema.decodeUnknown(
        Protocol.GreetingsMessageSchema,
      )(expected);
      const encoded = yield* Schema.encode(Protocol.GreetingsMessageSchema)(
        decoded,
      );

      expect(encoded).toEqual(expected);
    }),
  );
});

describe("CommandFailedMessageSchema", () => {
  it.effect("encodes CommandFailedMessageSchema to correct JSON object", () =>
    Effect.gen(function* () {
      const expected = {
        tag: "CommandFailed",
        clientInput: { tag: "Init" },
      };

      const decoded = yield* Schema.decodeUnknown(
        Protocol.CommandFailedMessageSchema,
      )(expected);
      const encoded = yield* Schema.encode(Protocol.CommandFailedMessageSchema)(
        decoded,
      );

      expect(encoded).toEqual(expected);
    }),
  );
});

describe("PostTxOnChainFailedMessageSchema", () => {
  it.effect(
    "encodes PostTxOnChainFailedMessageSchema to correct JSON object",
    () =>
      Effect.gen(function* () {
        const expected = {
          tag: "PostTxOnChainFailed",
          postChainTx: {
            tag: "InitTx",
            participants: ["alice"],
            headParameters: {
              contestationPeriod: 100,
              parties: [
                {
                  vkey: "d0b8f28427aa7b640c636075905cbd6574a431aeaca5b3dbafd47cfe66c35043",
                },
              ],
            },
          },
          postTxError: { error: "test" },
        };

        const decoded = yield* Schema.decodeUnknown(
          Protocol.PostTxOnChainFailedMessageSchema,
        )(expected);
        const encoded = yield* Schema.encode(
          Protocol.PostTxOnChainFailedMessageSchema,
        )(decoded);

        expect(encoded).toEqual(expected);
      }),
  );
});

describe("PeerConnectedMessageSchema", () => {
  it.effect("encodes PeerConnectedMessageSchema to correct JSON object", () =>
    Effect.gen(function* () {
      const expected = {
        tag: "PeerConnected",
        peer: { hostname: "localhost", port: 5001 },
        seq: 1,
        timestamp: "2019-08-24T14:15:22.000Z",
      };

      const decoded = yield* Schema.decodeUnknown(
        Protocol.PeerConnectedMessageSchema,
      )(expected);
      const encoded = yield* Schema.encode(Protocol.PeerConnectedMessageSchema)(
        decoded,
      );

      expect(encoded).toEqual(expected);
    }),
  );
});

describe("PeerDisconnectedMessageSchema", () => {
  it.effect(
    "encodes PeerDisconnectedMessageSchema to correct JSON object",
    () =>
      Effect.gen(function* () {
        const expected = {
          tag: "PeerDisconnected",
          peer: { hostname: "localhost", port: 5001 },
          seq: 1,
          timestamp: "2019-08-24T14:15:22.000Z",
        };

        const decoded = yield* Schema.decodeUnknown(
          Protocol.PeerDisconnectedMessageSchema,
        )(expected);
        const encoded = yield* Schema.encode(
          Protocol.PeerDisconnectedMessageSchema,
        )(decoded);

        expect(encoded).toEqual(expected);
      }),
  );
});

describe("NetworkConnectedMessageSchema", () => {
  it.effect(
    "encodes NetworkConnectedMessageSchema to correct JSON object",
    () =>
      Effect.gen(function* () {
        const expected = {
          tag: "NetworkConnected",
          seq: 1,
          timestamp: "2019-08-24T14:15:22.000Z",
        };

        const decoded = yield* Schema.decodeUnknown(
          Protocol.NetworkConnectedMessageSchema,
        )(expected);
        const encoded = yield* Schema.encode(
          Protocol.NetworkConnectedMessageSchema,
        )(decoded);

        expect(encoded).toEqual(expected);
      }),
  );
});

describe("NetworkDisconnectedMessageSchema", () => {
  it.effect(
    "encodes NetworkDisconnectedMessageSchema to correct JSON object",
    () =>
      Effect.gen(function* () {
        const expected = {
          tag: "NetworkDisconnected",
          seq: 1,
          timestamp: "2019-08-24T14:15:22.000Z",
        };

        const decoded = yield* Schema.decodeUnknown(
          Protocol.NetworkDisconnectedMessageSchema,
        )(expected);
        const encoded = yield* Schema.encode(
          Protocol.NetworkDisconnectedMessageSchema,
        )(decoded);

        expect(encoded).toEqual(expected);
      }),
  );
});

describe("NetworkVersionMismatchMessageSchema", () => {
  it.effect(
    "encodes NetworkVersionMismatchMessageSchema to correct JSON object",
    () =>
      Effect.gen(function* () {
        const expected = {
          tag: "NetworkVersionMismatch",
          ourVersion: 1,
          theirVersion: 2,
          seq: 1,
          timestamp: "2019-08-24T14:15:22.000Z",
        };

        const decoded = yield* Schema.decodeUnknown(
          Protocol.NetworkVersionMismatchMessageSchema,
        )(expected);
        const encoded = yield* Schema.encode(
          Protocol.NetworkVersionMismatchMessageSchema,
        )(decoded);

        expect(encoded).toEqual(expected);
      }),
  );

  it.effect("encodes with null ourVersion", () =>
    Effect.gen(function* () {
      const expected = {
        tag: "NetworkVersionMismatch",
        ourVersion: null,
        theirVersion: 2,
        seq: 1,
        timestamp: "2019-08-24T14:15:22.000Z",
      };

      const decoded = yield* Schema.decodeUnknown(
        Protocol.NetworkVersionMismatchMessageSchema,
      )(expected);
      const encoded = yield* Schema.encode(
        Protocol.NetworkVersionMismatchMessageSchema,
      )(decoded);

      expect(encoded).toEqual(expected);
    }),
  );
});

describe("NetworkClusterIDMismatchMessageSchema", () => {
  it.effect(
    "encodes NetworkClusterIDMismatchMessageSchema to correct JSON object",
    () =>
      Effect.gen(function* () {
        const expected = {
          tag: "NetworkClusterIDMismatch",
          clusterPeers: "peer1,peer2",
          misconfiguredPeers: "peer3",
          seq: 1,
          timestamp: "2019-08-24T14:15:22.000Z",
        };

        const decoded = yield* Schema.decodeUnknown(
          Protocol.NetworkClusterIDMismatchMessageSchema,
        )(expected);
        const encoded = yield* Schema.encode(
          Protocol.NetworkClusterIDMismatchMessageSchema,
        )(decoded);

        expect(encoded).toEqual(expected);
      }),
  );
});

describe("HeadIsInitializingMessageSchema", () => {
  it.effect(
    "encodes HeadIsInitializingMessageSchema to correct JSON object",
    () =>
      Effect.gen(function* () {
        const expected = {
          tag: "HeadIsInitializing",
          headId: "820082582089ff4f3ff4a6052ec9d073",
          parties: [
            {
              vkey: "d0b8f28427aa7b640c636075905cbd6574a431aeaca5b3dbafd47cfe66c35043",
            },
          ],
          seq: 1,
          timestamp: "2019-08-24T14:15:22.000Z",
        };

        const decoded = yield* Schema.decodeUnknown(
          Protocol.HeadIsInitializingMessageSchema,
        )(expected);
        const encoded = yield* Schema.encode(
          Protocol.HeadIsInitializingMessageSchema,
        )(decoded);

        expect(encoded).toEqual(expected);
      }),
  );
});

describe("CommittedMessageSchema", () => {
  it.effect("encodes CommittedMessageSchema to correct JSON object", () =>
    Effect.gen(function* () {
      const expected = {
        tag: "Committed",
        headId: "820082582089ff4f3ff4a6052ec9d073",
        parties: [
          {
            vkey: "d0b8f28427aa7b640c636075905cbd6574a431aeaca5b3dbafd47cfe66c35043",
          },
        ],
        utxo: '{    "09d34606abdcd0b10ebc89307cbfa0b469f9144194137b45b7a04b273961add8#687": {        "address": "addr1w9htvds89a78ex2uls5y969ttry9s3k9etww0staxzndwlgmzuul5",        "value": {            "lovelace": 7620669        }    }}',
        seq: 1,
        timestamp: "2019-08-24T14:15:22.000Z",
      };

      const decoded = yield* Schema.decodeUnknown(
        Protocol.CommittedMessageSchema,
      )(expected);
      const encoded = yield* Schema.encode(Protocol.CommittedMessageSchema)(
        decoded,
      );

      expect(encoded).toEqual(expected);
    }),
  );
});

describe("HeadIsOpenMessageSchema", () => {
  it.effect("encodes HeadIsOpenMessageSchema to correct JSON object", () =>
    Effect.gen(function* () {
      const expected = {
        tag: "HeadIsOpen",
        headId: "820082582089ff4f3ff4a6052ec9d073",
        utxo: '{    "09d34606abdcd0b10ebc89307cbfa0b469f9144194137b45b7a04b273961add8#687": {        "address": "addr1w9htvds89a78ex2uls5y969ttry9s3k9etww0staxzndwlgmzuul5",        "value": {            "lovelace": 7620669        }    }}',
        seq: 1,
        timestamp: "2019-08-24T14:15:22.000Z",
      };

      const decoded = yield* Schema.decodeUnknown(
        Protocol.HeadIsOpenMessageSchema,
      )(expected);
      const encoded = yield* Schema.encode(Protocol.HeadIsOpenMessageSchema)(
        decoded,
      );

      expect(encoded).toEqual(expected);
    }),
  );
});

describe("HeadIsClosedMessageSchema", () => {
  it.effect("encodes HeadIsClosedMessageSchema to correct JSON object", () =>
    Effect.gen(function* () {
      const expected = {
        tag: "HeadIsClosed",
        headId: "820082582089ff4f3ff4a6052ec9d073",
        snapshotNumber: 5,
        contestationDeadline: "2019-08-24T14:15:22.000Z",
        utxo: '{    "09d34606abdcd0b10ebc89307cbfa0b469f9144194137b45b7a04b273961add8#687": {        "address": "addr1w9htvds89a78ex2uls5y969ttry9s3k9etww0staxzndwlgmzuul5",        "value": {            "lovelace": 7620669        }    }}',
        seq: 1,
        timestamp: "2019-08-24T14:15:22.000Z",
      };

      const decoded = yield* Schema.decodeUnknown(
        Protocol.HeadIsClosedMessageSchema,
      )(expected);
      const encoded = yield* Schema.encode(Protocol.HeadIsClosedMessageSchema)(
        decoded,
      );

      expect(encoded).toEqual(expected);
    }),
  );
});

describe("HeadIsContestedMessageSchema", () => {
  it.effect("encodes HeadIsContestedMessageSchema to correct JSON object", () =>
    Effect.gen(function* () {
      const expected = {
        tag: "HeadIsContested",
        headId: "820082582089ff4f3ff4a6052ec9d073",
        snapshotNumber: 5,
        contestationDeadline: "2019-08-24T14:15:22.000Z",
        utxo: '{    "09d34606abdcd0b10ebc89307cbfa0b469f9144194137b45b7a04b273961add8#687": {        "address": "addr1w9htvds89a78ex2uls5y969ttry9s3k9etww0staxzndwlgmzuul5",        "value": {            "lovelace": 7620669        }    }}',
        seq: 1,
        timestamp: "2019-08-24T14:15:22.000Z",
      };

      const decoded = yield* Schema.decodeUnknown(
        Protocol.HeadIsContestedMessageSchema,
      )(expected);
      const encoded = yield* Schema.encode(
        Protocol.HeadIsContestedMessageSchema,
      )(decoded);

      expect(encoded).toEqual(expected);
    }),
  );
});

describe("ReadyToFanoutMessageSchema", () => {
  it.effect("encodes ReadyToFanoutMessageSchema to correct JSON object", () =>
    Effect.gen(function* () {
      const expected = {
        tag: "ReadyToFanout",
        headId: "820082582089ff4f3ff4a6052ec9d073",
        seq: 1,
        timestamp: "2019-08-24T14:15:22.000Z",
      };

      const decoded = yield* Schema.decodeUnknown(
        Protocol.ReadyToFanoutMessageSchema,
      )(expected);
      const encoded = yield* Schema.encode(Protocol.ReadyToFanoutMessageSchema)(
        decoded,
      );

      expect(encoded).toEqual(expected);
    }),
  );
});

describe("HeadIsAbortedMessageSchema", () => {
  it.effect("encodes HeadIsAbortedMessageSchema to correct JSON object", () =>
    Effect.gen(function* () {
      const expected = {
        tag: "HeadIsAborted",
        headId: "820082582089ff4f3ff4a6052ec9d073",
        utxo: '{    "09d34606abdcd0b10ebc89307cbfa0b469f9144194137b45b7a04b273961add8#687": {        "address": "addr1w9htvds89a78ex2uls5y969ttry9s3k9etww0staxzndwlgmzuul5",        "value": {            "lovelace": 7620669        }    }}',
        seq: 1,
        timestamp: "2019-08-24T14:15:22.000Z",
      };

      const decoded = yield* Schema.decodeUnknown(
        Protocol.HeadIsAbortedMessageSchema,
      )(expected);
      const encoded = yield* Schema.encode(Protocol.HeadIsAbortedMessageSchema)(
        decoded,
      );

      expect(encoded).toEqual(expected);
    }),
  );
});

describe("HeadIsFinalizedMessageSchema", () => {
  it.effect("encodes HeadIsFinalizedMessageSchema to correct JSON object", () =>
    Effect.gen(function* () {
      const expected = {
        tag: "HeadIsFinalized",
        headId: "820082582089ff4f3ff4a6052ec9d073",
        utxo: '{    "09d34606abdcd0b10ebc89307cbfa0b469f9144194137b45b7a04b273961add8#687": {        "address": "addr1w9htvds89a78ex2uls5y969ttry9s3k9etww0staxzndwlgmzuul5",        "value": {            "lovelace": 7620669        }    }}',
        seq: 1,
        timestamp: "2019-08-24T14:15:22.000Z",
      };

      const decoded = yield* Schema.decodeUnknown(
        Protocol.HeadIsFinalizedMessageSchema,
      )(expected);
      const encoded = yield* Schema.encode(
        Protocol.HeadIsFinalizedMessageSchema,
      )(decoded);

      expect(encoded).toEqual(expected);
    }),
  );
});

describe("TxValidMessageSchema", () => {
  it.effect("encodes TxValidMessageSchema to correct JSON object", () =>
    Effect.gen(function* () {
      const expected = {
        tag: "TxValid",
        headId: "820082582089ff4f3ff4a6052ec9d073",
        transactionId: "tx123",
        seq: 1,
        timestamp: "2019-08-24T14:15:22.000Z",
      };

      const decoded = yield* Schema.decodeUnknown(
        Protocol.TxValidMessageSchema,
      )(expected);
      const encoded = yield* Schema.encode(Protocol.TxValidMessageSchema)(
        decoded,
      );

      expect(encoded).toEqual(expected);
    }),
  );
});

describe("TxInvalidMessageSchema", () => {
  it.effect("encodes TxInvalidMessageSchema to correct JSON object", () =>
    Effect.gen(function* () {
      const expected = {
        tag: "TxInvalid",
        headId: "820082582089ff4f3ff4a6052ec9d073",
        utxo: '{    "09d34606abdcd0b10ebc89307cbfa0b469f9144194137b45b7a04b273961add8#687": {        "address": "addr1w9htvds89a78ex2uls5y969ttry9s3k9etww0staxzndwlgmzuul5",        "value": {            "lovelace": 7620669        }    }}',
        transaction: {
          txId: "8df1616d4337ede40bbad2914f12977815234b83951bcce3bfcd735aed3f63e4",
          type: "Tx ConwayEra",
          description: "",
          cborHex:
            "820082582089ff4f3ff4a6052ec9d073b3be68b5e7596bd74a04e7b74504a8302fb2278cd95840f66eb3cd160372d617411408792c0ebd9791968e9948112894e2706697a55c10296b04019ed2f146f4d81e8ab17b9d14cf99569a2f85cbfa32320127831db202",
        },
        validationError: { reason: "Invalid signature" },
        seq: 1,
        timestamp: "2019-08-24T14:15:22.000Z",
      };

      const decoded = yield* Schema.decodeUnknown(
        Protocol.TxInvalidMessageSchema,
      )(expected);
      const encoded = yield* Schema.encode(Protocol.TxInvalidMessageSchema)(
        decoded,
      );

      expect(encoded).toEqual(expected);
    }),
  );
});

describe("SnapshotConfirmedMessageSchema", () => {
  it.effect(
    "encodes SnapshotConfirmedMessageSchema to correct JSON object",
    () =>
      Effect.gen(function* () {
        const expected = {
          tag: "SnapshotConfirmed",
          headId: "820082582089ff4f3ff4a6052ec9d073",
          snapshot: {
            headId: "820082582089ff4f3ff4a6052ec9d073",
            version: 1,
            number: 5,
            confirmed: [],
            utxo: '{    "09d34606abdcd0b10ebc89307cbfa0b469f9144194137b45b7a04b273961add8#687": {        "address": "addr1w9htvds89a78ex2uls5y969ttry9s3k9etww0staxzndwlgmzuul5",        "value": {            "lovelace": 7620669        }    }}',
          },
          seq: 1,
          timestamp: "2019-08-24T14:15:22.000Z",
        };

        const decoded = yield* Schema.decodeUnknown(
          Protocol.SnapshotConfirmedMessageSchema,
        )(expected);
        const encoded = yield* Schema.encode(
          Protocol.SnapshotConfirmedMessageSchema,
        )(decoded);

        expect(encoded).toEqual(expected);
      }),
  );
});

describe("InvalidInputMessageSchema", () => {
  it.effect("encodes InvalidInputMessageSchema to correct JSON object", () =>
    Effect.gen(function* () {
      const expected = {
        tag: "InvalidInput",
        reason: "Malformed JSON",
        input: "invalid data",
      };

      const decoded = yield* Schema.decodeUnknown(
        Protocol.InvalidInputMessageSchema,
      )(expected);
      const encoded = yield* Schema.encode(Protocol.InvalidInputMessageSchema)(
        decoded,
      );

      expect(encoded).toEqual(expected);
    }),
  );
});

describe("IgnoredHeadInitializingMessageSchema", () => {
  it.effect(
    "encodes IgnoredHeadInitializingMessageSchema to correct JSON object",
    () =>
      Effect.gen(function* () {
        const expected = {
          tag: "IgnoredHeadInitializing",
          headId: "820082582089ff4f3ff4a6052ec9d073",
          contestationPeriod: 100,
          parties: [
            {
              vkey: "d0b8f28427aa7b640c636075905cbd6574a431aeaca5b3dbafd47cfe66c35043",
            },
          ],
          participants: ["alice"],
          seq: 1,
          timestamp: "2019-08-24T14:15:22.000Z",
        };

        const decoded = yield* Schema.decodeUnknown(
          Protocol.IgnoredHeadInitializingMessageSchema,
        )(expected);
        const encoded = yield* Schema.encode(
          Protocol.IgnoredHeadInitializingMessageSchema,
        )(decoded);

        expect(encoded).toEqual(expected);
      }),
  );
});

describe("DecommitInvalidMessageSchema", () => {
  it.effect("encodes DecommitInvalid with DecommitTxInvalid reason", () =>
    Effect.gen(function* () {
      const expected = {
        tag: "DecommitInvalid",
        headId: "820082582089ff4f3ff4a6052ec9d073",
        decommitTx: {
          txId: "8df1616d4337ede40bbad2914f12977815234b83951bcce3bfcd735aed3f63e4",
          type: "Tx ConwayEra",
          description: "",
          cborHex:
            "820082582089ff4f3ff4a6052ec9d073b3be68b5e7596bd74a04e7b74504a8302fb2278cd95840f66eb3cd160372d617411408792c0ebd9791968e9948112894e2706697a55c10296b04019ed2f146f4d81e8ab17b9d14cf99569a2f85cbfa32320127831db202",
        },
        decommitInvalidReason: {
          tag: "DecommitTxInvalid",
          localUTxO:
            '{    "09d34606abdcd0b10ebc89307cbfa0b469f9144194137b45b7a04b273961add8#687": {        "address": "addr1w9htvds89a78ex2uls5y969ttry9s3k9etww0staxzndwlgmzuul5",        "value": {            "lovelace": 7620669        }    }}',
          validationError: { reason: "Invalid" },
        },
        seq: 1,
        timestamp: "2019-08-24T14:15:22.000Z",
      };

      const decoded = yield* Schema.decodeUnknown(
        Protocol.DecommitInvalidMessageSchema,
      )(expected);
      const encoded = yield* Schema.encode(
        Protocol.DecommitInvalidMessageSchema,
      )(decoded);

      expect(encoded).toEqual(expected);
    }),
  );

  it.effect("encodes DecommitInvalid with DecommitAlreadyInFlight reason", () =>
    Effect.gen(function* () {
      const expected = {
        tag: "DecommitInvalid",
        headId: "820082582089ff4f3ff4a6052ec9d073",
        decommitTx: {
          txId: "8df1616d4337ede40bbad2914f12977815234b83951bcce3bfcd735aed3f63e4",
          type: "Tx ConwayEra",
          description: "",
          cborHex:
            "820082582089ff4f3ff4a6052ec9d073b3be68b5e7596bd74a04e7b74504a8302fb2278cd95840f66eb3cd160372d617411408792c0ebd9791968e9948112894e2706697a55c10296b04019ed2f146f4d81e8ab17b9d14cf99569a2f85cbfa32320127831db202",
        },
        decommitInvalidReason: {
          tag: "DecommitAlreadyInFlight",
          otherDecommitTxId:
            "8df1616d4337ede40bbad2914f12977815234b83951bcce3bfcd735aed3f63e4",
        },
        seq: 1,
        timestamp: "2019-08-24T14:15:22.000Z",
      };

      const decoded = yield* Schema.decodeUnknown(
        Protocol.DecommitInvalidMessageSchema,
      )(expected);
      const encoded = yield* Schema.encode(
        Protocol.DecommitInvalidMessageSchema,
      )(decoded);

      expect(encoded).toEqual(expected);
    }),
  );
});

describe("DecommitRequestedMessageSchema", () => {
  it.effect(
    "encodes DecommitRequestedMessageSchema to correct JSON object",
    () =>
      Effect.gen(function* () {
        const expected = {
          tag: "DecommitRequested",
          headId: "820082582089ff4f3ff4a6052ec9d073",
          decommitTx: {
            txId: "8df1616d4337ede40bbad2914f12977815234b83951bcce3bfcd735aed3f63e4",
            type: "Tx ConwayEra",
            description: "",
            cborHex:
              "820082582089ff4f3ff4a6052ec9d073b3be68b5e7596bd74a04e7b74504a8302fb2278cd95840f66eb3cd160372d617411408792c0ebd9791968e9948112894e2706697a55c10296b04019ed2f146f4d81e8ab17b9d14cf99569a2f85cbfa32320127831db202",
          },
          utxoToDecommit:
            '{    "09d34606abdcd0b10ebc89307cbfa0b469f9144194137b45b7a04b273961add8#687": {        "address": "addr1w9htvds89a78ex2uls5y969ttry9s3k9etww0staxzndwlgmzuul5",        "value": {            "lovelace": 7620669        }    }}',
          seq: 1,
          timestamp: "2019-08-24T14:15:22.000Z",
        };

        const decoded = yield* Schema.decodeUnknown(
          Protocol.DecommitRequestedMessageSchema,
        )(expected);
        const encoded = yield* Schema.encode(
          Protocol.DecommitRequestedMessageSchema,
        )(decoded);

        expect(encoded).toEqual(expected);
      }),
  );
});

describe("DecommitApprovedMessageSchema", () => {
  it.effect(
    "encodes DecommitApprovedMessageSchema to correct JSON object",
    () =>
      Effect.gen(function* () {
        const expected = {
          tag: "DecommitApproved",
          headId: "820082582089ff4f3ff4a6052ec9d073",
          decommitTxId:
            "8df1616d4337ede40bbad2914f12977815234b83951bcce3bfcd735aed3f63e4",
          utxoToDecommit:
            '{    "09d34606abdcd0b10ebc89307cbfa0b469f9144194137b45b7a04b273961add8#687": {        "address": "addr1w9htvds89a78ex2uls5y969ttry9s3k9etww0staxzndwlgmzuul5",        "value": {            "lovelace": 7620669        }    }}',
          seq: 1,
          timestamp: "2019-08-24T14:15:22.000Z",
        };

        const decoded = yield* Schema.decodeUnknown(
          Protocol.DecommitApprovedMessageSchema,
        )(expected);
        const encoded = yield* Schema.encode(
          Protocol.DecommitApprovedMessageSchema,
        )(decoded);

        expect(encoded).toEqual(expected);
      }),
  );
});

describe("DecommitFinalizedMessageSchema", () => {
  it.effect(
    "encodes DecommitFinalizedMessageSchema to correct JSON object",
    () =>
      Effect.gen(function* () {
        const expected = {
          tag: "DecommitFinalized",
          headId: "820082582089ff4f3ff4a6052ec9d073",
          distributedUTxO:
            '{    "09d34606abdcd0b10ebc89307cbfa0b469f9144194137b45b7a04b273961add8#687": {        "address": "addr1w9htvds89a78ex2uls5y969ttry9s3k9etww0staxzndwlgmzuul5",        "value": {            "lovelace": 7620669        }    }}',
          seq: 1,
          timestamp: "2019-08-24T14:15:22.000Z",
        };

        const decoded = yield* Schema.decodeUnknown(
          Protocol.DecommitFinalizedMessageSchema,
        )(expected);
        const encoded = yield* Schema.encode(
          Protocol.DecommitFinalizedMessageSchema,
        )(decoded);

        expect(encoded).toEqual(expected);
      }),
  );
});

describe("CommitRecordedMessageSchema", () => {
  it.effect("encodes CommitRecordedMessageSchema to correct JSON object", () =>
    Effect.gen(function* () {
      const expected = {
        tag: "CommitRecorded",
        headId: "820082582089ff4f3ff4a6052ec9d073",
        utxoToCommit:
          '{    "09d34606abdcd0b10ebc89307cbfa0b469f9144194137b45b7a04b273961add8#687": {        "address": "addr1w9htvds89a78ex2uls5y969ttry9s3k9etww0staxzndwlgmzuul5",        "value": {            "lovelace": 7620669        }    }}',
        pendingDeposit: "deposit1",
        deadline: "2019-08-24T14:15:22.000Z",
        seq: 1,
        timestamp: "2019-08-24T14:15:22.000Z",
      };

      const decoded = yield* Schema.decodeUnknown(
        Protocol.CommitRecordedMessageSchema,
      )(expected);
      const encoded = yield* Schema.encode(
        Protocol.CommitRecordedMessageSchema,
      )(decoded);

      expect(encoded).toEqual(expected);
    }),
  );
});

describe("CommitApprovedMessageSchema", () => {
  it.effect("encodes CommitApprovedMessageSchema to correct JSON object", () =>
    Effect.gen(function* () {
      const expected = {
        tag: "CommitApproved",
        headId: "820082582089ff4f3ff4a6052ec9d073",
        utxoToCommit:
          '{    "09d34606abdcd0b10ebc89307cbfa0b469f9144194137b45b7a04b273961add8#687": {        "address": "addr1w9htvds89a78ex2uls5y969ttry9s3k9etww0staxzndwlgmzuul5",        "value": {            "lovelace": 7620669        }    }}',
        seq: 1,
        timestamp: "2019-08-24T14:15:22.000Z",
      };

      const decoded = yield* Schema.decodeUnknown(
        Protocol.CommitApprovedMessageSchema,
      )(expected);
      const encoded = yield* Schema.encode(
        Protocol.CommitApprovedMessageSchema,
      )(decoded);

      expect(encoded).toEqual(expected);
    }),
  );
});

describe("CommitFinalizedMessageSchema", () => {
  it.effect("encodes CommitFinalizedMessageSchema to correct JSON object", () =>
    Effect.gen(function* () {
      const expected = {
        tag: "CommitFinalized",
        headId: "820082582089ff4f3ff4a6052ec9d073",
        depositTxId:
          "8df1616d4337ede40bbad2914f12977815234b83951bcce3bfcd735aed3f63e4",
        seq: 1,
        timestamp: "2019-08-24T14:15:22.000Z",
      };

      const decoded = yield* Schema.decodeUnknown(
        Protocol.CommitFinalizedMessageSchema,
      )(expected);
      const encoded = yield* Schema.encode(
        Protocol.CommitFinalizedMessageSchema,
      )(decoded);

      expect(encoded).toEqual(expected);
    }),
  );
});

describe("CommitRecoveredMessageSchema", () => {
  it.effect("encodes CommitRecoveredMessageSchema to correct JSON object", () =>
    Effect.gen(function* () {
      const expected = {
        tag: "CommitRecovered",
        headId: "820082582089ff4f3ff4a6052ec9d073",
        recoveredUTxO:
          '{    "09d34606abdcd0b10ebc89307cbfa0b469f9144194137b45b7a04b273961add8#687": {        "address": "addr1w9htvds89a78ex2uls5y969ttry9s3k9etww0staxzndwlgmzuul5",        "value": {            "lovelace": 7620669        }    }}',
        recoveredTxId:
          "8df1616d4337ede40bbad2914f12977815234b83951bcce3bfcd735aed3f63e4",
        seq: 1,
        timestamp: "2019-08-24T14:15:22.000Z",
      };

      const decoded = yield* Schema.decodeUnknown(
        Protocol.CommitRecoveredMessageSchema,
      )(expected);
      const encoded = yield* Schema.encode(
        Protocol.CommitRecoveredMessageSchema,
      )(decoded);

      expect(encoded).toEqual(expected);
    }),
  );
});

describe("SnapshotSideLoadedMessageSchema", () => {
  it.effect(
    "encodes SnapshotSideLoadedMessageSchema to correct JSON object",
    () =>
      Effect.gen(function* () {
        const expected = {
          tag: "SnapshotSideLoaded",
          headId: "820082582089ff4f3ff4a6052ec9d073",
          snapshotNumber: 5,
          seq: 1,
          timestamp: "2019-08-24T14:15:22.000Z",
        };

        const decoded = yield* Schema.decodeUnknown(
          Protocol.SnapshotSideLoadedMessageSchema,
        )(expected);
        const encoded = yield* Schema.encode(
          Protocol.SnapshotSideLoadedMessageSchema,
        )(decoded);

        expect(encoded).toEqual(expected);
      }),
  );
});

describe("EventLogRotatedMessageSchema", () => {
  it.effect("encodes EventLogRotatedMessageSchema to correct JSON object", () =>
    Effect.gen(function* () {
      const expected = {
        tag: "EventLogRotated",
        seq: 1,
        timestamp: "2019-08-24T14:15:22.000Z",
      };

      const decoded = yield* Schema.decodeUnknown(
        Protocol.EventLogRotatedMessageSchema,
      )(expected);
      const encoded = yield* Schema.encode(
        Protocol.EventLogRotatedMessageSchema,
      )(decoded);

      expect(encoded).toEqual(expected);
    }),
  );
});

describe("WebSocketResponseMessageSchema", () => {
  it.effect("encodes different message types", () =>
    Effect.gen(function* () {
      const greetingsExpected = {
        tag: "Greetings",
        me: {
          vkey: "d0b8f28427aa7b640c636075905cbd6574a431aeaca5b3dbafd47cfe66c35043",
        },
        headStatus: "Idle",
        hydraHeadId: "820082582089ff4f3ff4a6052ec9d073",
        snapshotUtxo: {
          "09d34606abdcd0b10ebc89307cbfa0b469f9144194137b45b7a04b273961add8#687": {
            "address": "addr1w9htvds89a78ex2uls5y969ttry9s3k9etww0staxzndwlgmzuul5",
            "value": {
              "lovelace": 7620669
            }
          }
        },
        timestamp: "2019-08-24T14:15:22.000Z",
        hydraNodeVersion: "1.0.0",
      };

      const greetingsDecoded = yield* Schema.decodeUnknown(
        Protocol.WebSocketResponseMessageSchema,
      )(greetingsExpected);
      const greetingsEncoded = yield* Schema.encode(
        Protocol.WebSocketResponseMessageSchema,
      )(greetingsDecoded);
      expect(greetingsEncoded).toEqual(greetingsExpected);

      const txValidExpected = {
        tag: "TxValid",
        headId: "820082582089ff4f3ff4a6052ec9d073",
        transactionId: "tx123",
        seq: 1,
        timestamp: "2019-08-24T14:15:22.000Z",
      };

      const txValidDecoded = yield* Schema.decodeUnknown(
        Protocol.WebSocketResponseMessageSchema,
      )(txValidExpected);
      const txValidEncoded = yield* Schema.encode(
        Protocol.WebSocketResponseMessageSchema,
      )(txValidDecoded);
      expect(txValidEncoded).toEqual(txValidExpected);
    }),
  );
});
