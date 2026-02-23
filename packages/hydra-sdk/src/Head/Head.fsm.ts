import { Effect, Ref } from "effect";

import { type ClientInputTag, HeadError, type HeadStatus } from "./Head.js";

// ---------------------------------------------------------------------------
// Transition table – encodes the Hydra Head protocol state machine
//
// Each entry maps (currentStatus, serverOutputTag) → nextStatus.
// If a transition is not listed, it is considered invalid.
// ---------------------------------------------------------------------------

type TransitionKey = `${HeadStatus}:${string}`;

const transitions: Record<TransitionKey, HeadStatus> = {
  // Idle → Initializing via Init
  "Idle:HeadIsInitializing": "Initializing",

  // Initializing → Open when all participants have committed
  "Initializing:HeadIsOpen": "Open",

  // Initializing → Aborted via Abort
  "Initializing:HeadIsAborted": "Aborted",

  // Open → Closed via Close or SafeClose
  "Open:HeadIsClosed": "Closed",

  // Open → Aborted (emergency abort while head is open)
  "Open:HeadIsAborted": "Aborted",

  // Closed → FanoutPossible when contestation period ends
  "Closed:ReadyToFanout": "FanoutPossible",

  // FanoutPossible → Final via Fanout
  "FanoutPossible:HeadIsFinalized": "Final",
};

// ---------------------------------------------------------------------------
// Command guards – which commands are legal in which states
//
// Derived from the Hydra Head protocol specification.
// Terminal states (Final, Aborted) reject all commands implicitly
// because they have no entries here.
// ---------------------------------------------------------------------------

const commandAllowedFrom: Record<ClientInputTag, ReadonlySet<HeadStatus>> = {
  Init: new Set(["Idle"]),
  Commit: new Set(["Initializing"]),
  Close: new Set(["Open"]),
  // TODO(protocol-schema): SafeClose is scaffold-only until protocol integration.
  SafeClose: new Set(["Open"]),
  Fanout: new Set(["FanoutPossible"]),
  // Abort is valid from Initializing per the Hydra spec.
  // Idle is included as a no-harm guard: aborting before any on-chain
  // activity is a no-op rather than an error.
  Abort: new Set(["Idle", "Initializing"]),
};

// ---------------------------------------------------------------------------
// Output tag ↔ status mappings (bidirectional, both O(1))
// ---------------------------------------------------------------------------

const outputTagToStatus: Readonly<Record<string, HeadStatus>> = {
  HeadIsIdle: "Idle",
  HeadIsInitializing: "Initializing",
  HeadIsOpen: "Open",
  HeadIsClosed: "Closed",
  ReadyToFanout: "FanoutPossible",
  HeadIsFinalized: "Final",
  HeadIsAborted: "Aborted",
};

const statusToOutputTag: Readonly<Record<HeadStatus, string>> = {
  Idle: "HeadIsIdle",
  Initializing: "HeadIsInitializing",
  Open: "HeadIsOpen",
  Closed: "HeadIsClosed",
  FanoutPossible: "ReadyToFanout",
  Final: "HeadIsFinalized",
  Aborted: "HeadIsAborted",
};

/** Resolve a server output tag to its corresponding HeadStatus, if any. */
export const statusFromOutputTag = (tag: string): HeadStatus | undefined =>
  outputTagToStatus[tag];

/** Resolve a HeadStatus to its corresponding server output tag. */
export const outputTagFromStatus = (status: HeadStatus): string | undefined =>
  statusToOutputTag[status];

// ---------------------------------------------------------------------------
// Terminal states – no commands allowed, no transitions out
// ---------------------------------------------------------------------------

const terminalStates: ReadonlySet<HeadStatus> = new Set(["Final", "Aborted"]);

// ---------------------------------------------------------------------------
// FSM interface
// ---------------------------------------------------------------------------

export interface HeadFsm {
  /** The single source of truth for head protocol state. */
  readonly status: Ref.Ref<HeadStatus>;

  /**
   * Apply a server output tag as a state transition.
   *
   * - If the tag does not correspond to a state transition, this is a no-op.
   * - If the transition is invalid from the current state, logs a warning
   *   but still applies it (trust-the-server semantics). Set `strict: true`
   *   in options to fail instead.
   */
  readonly applyOutputTag: (
    tag: string,
    options?: { readonly strict?: boolean },
  ) => Effect.Effect<void, HeadError>;

  /**
   * Assert that a client command is allowed in the current state.
   * Fails with HeadError if the command is not valid.
   */
  readonly assertCommandAllowed: (
    command: ClientInputTag,
  ) => Effect.Effect<void, HeadError>;

  /** Read the current status. Convenience alias for Ref.get(fsm.status). */
  readonly getStatus: Effect.Effect<HeadStatus>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const makeHeadFsm = (): Effect.Effect<HeadFsm> =>
  Effect.gen(function* () {
    const status = yield* Ref.make<HeadStatus>("Idle");

    // ---------------------------------------------------------------------
    // applyOutputTag
    // ---------------------------------------------------------------------
    const applyOutputTag = (
      tag: string,
      options?: { readonly strict?: boolean },
    ): Effect.Effect<void, HeadError> => {
      const target = outputTagToStatus[tag];

      // Not a transition-bearing tag → no-op
      if (target === undefined) return Effect.void;

      return Ref.get(status).pipe(
        Effect.flatMap((current) => {
          // Already in target state → idempotent no-op
          if (current === target) return Effect.void;

          const key: TransitionKey = `${current}:${tag}`;
          const isValid = key in transitions;

          if (!isValid) {
            const message = `Invalid FSM transition: ${current} → ${target} via ${tag}`;

            if (options?.strict) {
              return Effect.fail(new HeadError({ message }));
            }

            // Trust-the-server: apply anyway.
            // This handles edge cases like reconnection where the server
            // may report a state we didn't observe the path to.
            return Ref.set(status, target);
          }

          return Ref.set(status, target);
        }),
      );
    };

    // ---------------------------------------------------------------------
    // assertCommandAllowed
    // ---------------------------------------------------------------------
    const assertCommandAllowed = (
      command: ClientInputTag,
    ): Effect.Effect<void, HeadError> =>
      Ref.get(status).pipe(
        Effect.flatMap((current) => {
          if (terminalStates.has(current)) {
            return Effect.fail(
              new HeadError({
                message: `Command ${command} is not allowed: head is in terminal state ${current}`,
              }),
            );
          }

          const allowed = commandAllowedFrom[command];
          if (allowed === undefined || !allowed.has(current)) {
            return Effect.fail(
              new HeadError({
                message: `Command ${command} is not allowed while head is ${current}`,
              }),
            );
          }

          return Effect.void;
        }),
      );

    // ---------------------------------------------------------------------
    // Public API
    // ---------------------------------------------------------------------
    return {
      status,
      applyOutputTag,
      assertCommandAllowed,
      getStatus: Ref.get(status),
    };
  });
