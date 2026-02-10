import { describe, it } from "@effect/vitest";
import { Protocol } from "@no-witness-labs/hydra-sdk";
import { Effect, Schema } from "effect";

describe("InitMessageSchema", () => {
  it.effect("validates a correct Init message", () =>
    Effect.gen(function* () {
      const input = {
        tag: "Init",
      };

      yield* Schema.decodeUnknown(Protocol.RequestMessageSchema)(input);
    }),
  );
});

describe("AbortMessageSchema", () => {
  it.effect("validates a correct Abort message", () =>
    Effect.gen(function* () {
      const input = {
        tag: "Abort",
      };

      yield* Schema.decodeUnknown(Protocol.RequestMessageSchema)(input);
    }),
  );
});

describe("NewTxMessageSchema", () => {
  it.effect("validates a correct NewTx message", () =>
    Effect.gen(function* () {
      const input = {
        tag: "NewTx",
        transaction: {
          txId: "8df1616d4337ede40bbad2914f12977815234b83951bcce3bfcd735aed3f63e4",
          type: "Tx ConwayEra",
          description: "",
          cborHex:
            "820082582089ff4f3ff4a6052ec9d073b3be68b5e7596bd74a04e7b74504a8302fb2278cd95840f66eb3cd160372d617411408792c0ebd9791968e9948112894e2706697a55c10296b04019ed2f146f4d81e8ab17b9d14cf99569a2f85cbfa32320127831db202",
        },
      };

      yield* Schema.decodeUnknown(Protocol.RequestMessageSchema)(input);
    }),
  );
});

describe("RecoverMessageSchema", () => {
  it.effect("validates a correct Recover message", () =>
    Effect.gen(function* () {
      const input = {
        tag: "Recover",
        recoverTxId:
          "8df1616d4337ede40bbad2914f12977815234b83951bcce3bfcd735aed3f63e4",
      };

      yield* Schema.decodeUnknown(Protocol.RequestMessageSchema)(input);
    }),
  );
});

describe("DecommitMessageSchema", () => {
  it.effect("validates a correct Decommit message", () =>
    Effect.gen(function* () {
      const input = {
        tag: "Decommit",
        decommitTx: {
          txId: "8df1616d4337ede40bbad2914f12977815234b83951bcce3bfcd735aed3f63e4",
          type: "Tx ConwayEra",
          description: "",
          cborHex:
            "820082582089ff4f3ff4a6052ec9d073b3be68b5e7596bd74a04e7b74504a8302fb2278cd95840f66eb3cd160372d617411408792c0ebd9791968e9948112894e2706697a55c10296b04019ed2f146f4d81e8ab17b9d14cf99569a2f85cbfa32320127831db202",
        },
      };

      yield* Schema.decodeUnknown(Protocol.RequestMessageSchema)(input);
    }),
  );
});

describe("CloseMessageSchema", () => {
  it.effect("validates a correct Close message", () =>
    Effect.gen(function* () {
      const input = {
        tag: "Close",
      };

      yield* Schema.decodeUnknown(Protocol.RequestMessageSchema)(input);
    }),
  );
});

describe("ContestMessageSchema", () => {
  it.effect("validates a correct Contest message", () =>
    Effect.gen(function* () {
      const input = {
        tag: "Contest",
      };

      yield* Schema.decodeUnknown(Protocol.RequestMessageSchema)(input);
    }),
  );
});

describe("FanoutMessageSchema", () => {
  it.effect("validates a correct Fanout message", () =>
    Effect.gen(function* () {
      const input = {
        tag: "Fanout",
      };

      yield* Schema.decodeUnknown(Protocol.RequestMessageSchema)(input);
    }),
  );
});

describe("SideLoadSnapshotMessageSchema", () => {
  it.effect("validates a correct SideLoadSnapshot message", () =>
    Effect.gen(function* () {
      const input = {
        tag: "SideLoadSnapshot",
      };

      yield* Schema.decodeUnknown(Protocol.RequestMessageSchema)(input);
    }),
  );
});

describe("Protocol.RequestMessageSchema", () => {
  it.effect("validates a union of different request message types", () =>
    Effect.gen(function* () {
      const initInput = {
        tag: "Init",
      };
      yield* Schema.decodeUnknown(Protocol.RequestMessageSchema)(initInput);

      const newTxInput = {
        tag: "NewTx",
        transaction: {
          txId: "8df1616d4337ede40bbad2914f12977815234b83951bcce3bfcd735aed3f63e4",
          type: "Tx ConwayEra",
          description: "",
          cborHex:
            "820082582089ff4f3ff4a6052ec9d073b3be68b5e7596bd74a04e7b74504a8302fb2278cd95840f66eb3cd160372d617411408792c0ebd9791968e9948112894e2706697a55c10296b04019ed2f146f4d81e8ab17b9d14cf99569a2f85cbfa32320127831db202",
        },
      };
      yield* Schema.decodeUnknown(Protocol.RequestMessageSchema)(newTxInput);

      const closeInput = {
        tag: "Close",
      };
      yield* Schema.decodeUnknown(Protocol.RequestMessageSchema)(closeInput);
    }),
  );
});
