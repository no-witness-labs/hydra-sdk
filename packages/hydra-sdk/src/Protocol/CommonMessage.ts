import { Effect, Option, Record, Schema } from "effect";

export const TransactionMessageSchema = Schema.Struct({
    type: Schema.Literal("Tx ConwayEra", "Unwitnessed Tx ConwayEra", "Witnessed Tx ConwayEra"),
    description: Schema.String,
    cborHex: Schema.String,
    txId: Schema.String,
  })
export type TransactionMessage = typeof TransactionMessageSchema.Type;
