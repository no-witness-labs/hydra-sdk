/**
 * HTTP client helpers for hydra-node REST endpoints.
 */
import { Data, Effect } from "effect";

import type { ProtocolParametersResponse } from "../Protocol/ResponseMessage.js";
import type { UTxO } from "../Protocol/Types.js";

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
 */
export const getSnapshotUtxo = (
  httpUrl: string,
): Effect.Effect<UTxO, HydraHttpError> =>
  fetchJson(`${httpUrl}/snapshot/utxo`) as Effect.Effect<UTxO, HydraHttpError>;

/**
 * `GET /protocol-parameters` — returns the head's protocol parameters.
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
 */
export const postCommit = (
  httpUrl: string,
  body: unknown,
): Effect.Effect<unknown, HydraHttpError> =>
  postJson(`${httpUrl}/commit`, body);
