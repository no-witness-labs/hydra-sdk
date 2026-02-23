import { describe, expect, it } from "@effect/vitest";
import { Protocol } from "@no-witness-labs/hydra-sdk";
import { Effect, Schema } from "effect";

describe("Negative schema validation", () => {
  it.effect("rejects message with missing required tag field", () =>
    Effect.gen(function* () {
      const input = {
        headId: "820082582089ff4f3ff4a6052ec9d073",
        seq: 1,
        timestamp: "2019-08-24T14:15:22.000Z",
      };

      const result = yield* Schema.decodeUnknown(
        Protocol.HeadIsOpenMessageSchema,
      )(input).pipe(Effect.either);

      expect(result._tag).toBe("Left");
    }),
  );

  it.effect("rejects message with wrong tag literal value", () =>
    Effect.gen(function* () {
      const input = {
        tag: "WrongTag",
        headId: "820082582089ff4f3ff4a6052ec9d073",
        utxo: {},
        seq: 1,
        timestamp: "2019-08-24T14:15:22.000Z",
      };

      const result = yield* Schema.decodeUnknown(
        Protocol.HeadIsOpenMessageSchema,
      )(input).pipe(Effect.either);

      expect(result._tag).toBe("Left");
    }),
  );

  it.effect("rejects message with wrong field type (seq as string)", () =>
    Effect.gen(function* () {
      const input = {
        tag: "HeadIsOpen",
        headId: "820082582089ff4f3ff4a6052ec9d073",
        utxo: {},
        seq: "not-a-number",
        timestamp: "2019-08-24T14:15:22.000Z",
      };

      const result = yield* Schema.decodeUnknown(
        Protocol.HeadIsOpenMessageSchema,
      )(input).pipe(Effect.either);

      expect(result._tag).toBe("Left");
    }),
  );

  it.effect("rejects message with missing required fields", () =>
    Effect.gen(function* () {
      const input = {
        tag: "HeadIsOpen",
        // missing headId, utxo, seq, timestamp
      };

      const result = yield* Schema.decodeUnknown(
        Protocol.HeadIsOpenMessageSchema,
      )(input).pipe(Effect.either);

      expect(result._tag).toBe("Left");
    }),
  );

  it.effect("rejects UTxO with wrong structure (array instead of object)", () =>
    Effect.gen(function* () {
      const input = {
        tag: "HeadIsOpen",
        headId: "820082582089ff4f3ff4a6052ec9d073",
        utxo: [{ address: "addr1...", value: { lovelace: 100 } }],
        seq: 1,
        timestamp: "2019-08-24T14:15:22.000Z",
      };

      const result = yield* Schema.decodeUnknown(
        Protocol.HeadIsOpenMessageSchema,
      )(input).pipe(Effect.either);

      expect(result._tag).toBe("Left");
    }),
  );

  it.effect("rejects request message with unknown tag", () =>
    Effect.gen(function* () {
      const input = {
        tag: "UnknownCommand",
      };

      const result = yield* Schema.decodeUnknown(Protocol.RequestMessageSchema)(
        input,
      ).pipe(Effect.either);

      expect(result._tag).toBe("Left");
    }),
  );

  it.effect("rejects Greetings with missing hydraNodeVersion", () =>
    Effect.gen(function* () {
      const input = {
        tag: "Greetings",
        me: { vkey: "abc123" },
        headStatus: "Idle",
        // missing hydraNodeVersion
      };

      const result = yield* Schema.decodeUnknown(
        Protocol.GreetingsMessageSchema,
      )(input).pipe(Effect.either);

      expect(result._tag).toBe("Left");
    }),
  );

  it.effect("rejects TxOut with missing address", () =>
    Effect.gen(function* () {
      const input = {
        tag: "Committed",
        headId: "820082582089ff4f3ff4a6052ec9d073",
        parties: [{ vkey: "abc123" }],
        utxo: {
          "txhash#0": {
            // missing address
            value: { lovelace: 100 },
          },
        },
        seq: 1,
        timestamp: "2019-08-24T14:15:22.000Z",
      };

      const result = yield* Schema.decodeUnknown(
        Protocol.CommittedMessageSchema,
      )(input).pipe(Effect.either);

      expect(result._tag).toBe("Left");
    }),
  );

  it.effect("rejects TxOut with missing value", () =>
    Effect.gen(function* () {
      const input = {
        tag: "Committed",
        headId: "820082582089ff4f3ff4a6052ec9d073",
        parties: [{ vkey: "abc123" }],
        utxo: {
          "txhash#0": {
            address: "addr1...",
            // missing value
          },
        },
        seq: 1,
        timestamp: "2019-08-24T14:15:22.000Z",
      };

      const result = yield* Schema.decodeUnknown(
        Protocol.CommittedMessageSchema,
      )(input).pipe(Effect.either);

      expect(result._tag).toBe("Left");
    }),
  );

  it.effect("accepts extra unknown fields (open schemas)", () =>
    Effect.gen(function* () {
      const input = {
        tag: "TxValid",
        headId: "820082582089ff4f3ff4a6052ec9d073",
        transactionId: "tx123",
        seq: 1,
        timestamp: "2019-08-24T14:15:22.000Z",
        extraField: "should be ignored",
      };

      const result = yield* Schema.decodeUnknown(Protocol.TxValidMessageSchema)(
        input,
      ).pipe(Effect.either);

      expect(result._tag).toBe("Right");
    }),
  );

  it.effect("accepts empty UTxO object", () =>
    Effect.gen(function* () {
      const input = {
        tag: "HeadIsOpen",
        headId: "820082582089ff4f3ff4a6052ec9d073",
        utxo: {},
        seq: 1,
        timestamp: "2019-08-24T14:15:22.000Z",
      };

      const result = yield* Schema.decodeUnknown(
        Protocol.HeadIsOpenMessageSchema,
      )(input).pipe(Effect.either);

      expect(result._tag).toBe("Right");
    }),
  );
});
