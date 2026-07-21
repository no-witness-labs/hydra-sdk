import { Protocol } from "@no-witness-labs/hydra-sdk";
import { Option, Schema } from "effect";

export type Status =
  | "DISCONNECTED"
  | "IDLE"
  | "OPEN"
  | "CLOSED"
  | "FANOUT_POSSIBLE"
  | "FINAL";

export function socketMessageToStatus(
  socketMessage: Protocol.WebSocketResponseMessage,
): Option.Option<Status> {
  if (Schema.is(Protocol.GreetingsMessageSchema)(socketMessage)) {
    switch (socketMessage.headStatus) {
      case "Idle":
        return Option.some("IDLE");
      case "Open":
        return Option.some("OPEN");
      case "Closed":
        return Option.some("CLOSED");
      case "FanoutPossible":
        return Option.some("FANOUT_POSSIBLE");
    }
  }

  switch (socketMessage.tag) {
    case "HeadIsOpen":
      return Option.some("OPEN");
    case "HeadIsContested":
      return Option.some("CLOSED");
    case "HeadIsClosed":
      return Option.some("CLOSED");
    case "ReadyToFanout":
      return Option.some("FANOUT_POSSIBLE");
    case "HeadIsFinalized":
      return Option.some("FINAL");
    default:
      return Option.none();
  }
}

export function headResponseToStatus(
  headResponse: Protocol.HeadResponse,
): Status {
  switch (headResponse.tag) {
    case "Idle":
      return "IDLE";
    case "Open":
      return "OPEN";
    case "Closed":
      return "CLOSED";
  }
}
