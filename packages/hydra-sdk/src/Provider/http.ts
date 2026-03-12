/**
 * HTTP client helpers for hydra-node REST endpoints.
 *
 * Use these when you need to call the hydra-node HTTP API directly (e.g. snapshot
 * UTxO, protocol parameters, or commit) without going through `HydraProvider`.
 */
import { Data, Effect } from "effect";

import type { ProtocolParametersResponse } from "../Protocol/ResponseMessage.js";
import type { UTxO } from "../Protocol/Types.js";

/**
 * Error thrown when an HTTP request to hydra-node fails.
 *
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { Provider } from "@no-witness-labs/hydra-sdk";
 *
 * const program = Provider.getSnapshotUtxo("http://localhost:4001").pipe(
 *   Effect.catchAll((err) => Effect.log(`HTTP failed: ${err.message}`))
 * );
 * // Run with: Effect.runPromise(program)
 * ```
 */
export class HydraHttpError extends Data.TaggedError("HydraHttpError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

/**
 * Fetch JSON from a hydra-node HTTP endpoint.
 */
const fetchJson = (url: string): Effect.Effect<unknown, HydraHttpError> =>
  Effect.tryPromise({
    try: async () => {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }
      return res.json();
    },
    catch: (cause) =>
      new HydraHttpError({
        message: `GET ${url} failed`,
        cause,
      }),
  });

/**
 * POST JSON to a hydra-node HTTP endpoint.
 */
const postJson = (
  url: string,
  body: unknown,
): Effect.Effect<unknown, HydraHttpError> =>
  Effect.tryPromise({
    try: async () => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }
      return res.json();
    },
    catch: (cause) =>
      new HydraHttpError({
        message: `POST ${url} failed`,
        cause,
      }),
  });

/**
 * `GET /snapshot/utxo` — returns the current snapshot UTxO set.
 *
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { Provider } from "@no-witness-labs/hydra-sdk";
 *
 * const program = Provider.getSnapshotUtxo("http://localhost:4001").pipe(
 *   Effect.map((utxo) => console.log("UTxO keys:", Object.keys(utxo)))
 * );
 * // Run with: Effect.runPromise(program)
 * ```
 */
export const getSnapshotUtxo = (
  httpUrl: string,
): Effect.Effect<UTxO, HydraHttpError> =>
  fetchJson(`${httpUrl}/snapshot/utxo`) as Effect.Effect<UTxO, HydraHttpError>;

/**
 * `GET /protocol-parameters` — returns the head's protocol parameters.
 *
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { Provider } from "@no-witness-labs/hydra-sdk";
 *
 * const program = Provider.getProtocolParameters("http://localhost:4001").pipe(
 *   Effect.map((params) => console.log("Max tx size:", params.maxTxSize))
 * );
 * // Run with: Effect.runPromise(program)
 * ```
 */
export const getProtocolParameters = (
  httpUrl: string,
): Effect.Effect<ProtocolParametersResponse, HydraHttpError> =>
  fetchJson(`${httpUrl}/protocol-parameters`) as Effect.Effect<
    ProtocolParametersResponse,
    HydraHttpError
  >;

/**
 * `POST /commit` — submit a commit request.
 *
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { Provider } from "@no-witness-labs/hydra-sdk";
 *
 * const program = Provider.postCommit("http://localhost:4001", {});
 * // Run with: Effect.runPromise(program)
 * ```
 */
export const postCommit = (
  httpUrl: string,
  body: unknown,
): Effect.Effect<unknown, HydraHttpError> =>
  postJson(`${httpUrl}/commit`, body);
