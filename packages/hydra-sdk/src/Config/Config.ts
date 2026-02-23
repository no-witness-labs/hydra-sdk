import {
  Effect,
  Schedule,
  Schema,
  Queue,
  PubSub,
  Scope,
  Duration,
} from "effect";

export class Config extends Effect.Service<Config>()("Config", {
  effect: (urlNoAppends: string) =>
    Effect.gen(function* () {
      const wsUrl = "ws://" + urlNoAppends;
      const httpUrl = "http://" + urlNoAppends;
      return {
        wsUrl,
        httpUrl,
      };
    }),
}) {}
