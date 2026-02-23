import { Protocol } from "@no-witness-labs/hydra-sdk";
import { Option, Schema } from "effect";

export type Status =
  | "DISCONNECTED"
  | "IDLE"
  | "INITIALIZING"
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
      case "Initializing":
        return Option.some("INITIALIZING");
      case "Open":
        return Option.some("OPEN");
      case "Closed":
        return Option.some("CLOSED");
      case "FanoutPossible":
        return Option.some("FANOUT_POSSIBLE");
      case "Final":
        return Option.some("FINAL");
    }
  }

  switch (socketMessage.tag) {
    case "HeadIsAborted":
      return Option.some("IDLE");
    case "HeadIsInitializing":
      return Option.some("INITIALIZING");
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
    case "HeadIsAborted":
      return Option.some("IDLE");
    default:
      return Option.none(); // TODO: check that error responses don't alter the head status
  }
}

export function headResponseToStatus(
  headResponse: Protocol.HeadResponse,
): Status {
  switch (headResponse.tag) {
    case "Idle":
      return "IDLE";
    case "Initial":
      return "INITIALIZING";
    case "Open":
      return "OPEN";
    case "Closed":
      return "CLOSED";
  }
}
