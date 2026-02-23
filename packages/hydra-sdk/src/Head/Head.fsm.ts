import { Effect, Ref } from "effect";

import { type ClientInputTag, HeadError, type HeadStatus } from "./Head.js";

const statusFromOutputTag = (tag: string): HeadStatus | null => {
  switch (tag) {
    case "HeadIsInitializing":
      return "Initializing";
    case "HeadIsOpen":
      return "Open";
    case "HeadIsClosed":
      return "Closed";
    case "ReadyToFanout":
      return "FanoutPossible";
    case "HeadIsFinalized":
      return "Final";
    case "HeadIsAborted":
      return "Aborted";
    default:
      return null;
  }
};

const canRunCommand = (
  status: HeadStatus,
  command: ClientInputTag,
): boolean => {
  switch (command) {
    case "Init":
      return status === "Idle";
    case "Commit":
      return status === "Initializing";
    case "Close":
      return status === "Open";
    case "SafeClose":
      // TODO(protocol-schema): SafeClose is scaffold-only until protocol integration.
      return status === "Open";
    case "Fanout":
      return status === "FanoutPossible";
    case "Abort":
      return status === "Initializing";
    default:
      return false;
  }
};

export interface HeadFsm {
  readonly status: Ref.Ref<HeadStatus>;
  readonly applyOutputTag: (tag: string) => Effect.Effect<void>;
  readonly assertCommandAllowed: (
    command: ClientInputTag,
  ) => Effect.Effect<void, HeadError>;
}

export const makeHeadFsm = (): Effect.Effect<HeadFsm> =>
  Effect.gen(function* () {
    const status = yield* Ref.make<HeadStatus>("Idle");

    const applyOutputTag = (tag: string): Effect.Effect<void> =>
      Effect.gen(function* () {
        const next = statusFromOutputTag(tag);
        if (next !== null) {
          yield* Ref.set(status, next);
        }
      });

    const assertCommandAllowed = (
      command: ClientInputTag,
    ): Effect.Effect<void, HeadError> =>
      Effect.gen(function* () {
        const current = yield* Ref.get(status);
        if (!canRunCommand(current, command)) {
          return yield* Effect.fail(
            new HeadError({
              message: `Command ${command} is not allowed while head is ${current}`,
            }),
          );
        }
      });

    return {
      status,
      applyOutputTag,
      assertCommandAllowed,
    };
  });
