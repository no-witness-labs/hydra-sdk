import {
  FetchHttpClient,
  HttpBody,
  HttpClient,
} from "@effect/platform";
import { Effect } from "effect";

import { HeadError } from "./Head.js";

// ---------------------------------------------------------------------------
// HTTP base URL derivation
//
// Hydra exposes REST endpoints on the same host:port as the WebSocket, but
// over HTTP(S). We derive the base URL from the WS URL by swapping the
// protocol scheme: ws → http, wss → https.
// ---------------------------------------------------------------------------

const deriveHttpBaseUrl = (wsUrl: string): string => {
  if (wsUrl.startsWith("mock://")) return wsUrl;
  const url = new URL(wsUrl);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  // Strip WS-specific query params (e.g. ?history=yes)
  url.search = "";
  // Remove trailing slash for consistent path joining
  return url.toString().replace(/\/$/, "");
};

// ---------------------------------------------------------------------------
// HeadHttpClient interface
//
// Mirrors the upstream Hydra HTTP REST API surface defined in
// hydra-node/src/Hydra/API/HTTPServer.hs
//
// Each method returns an Effect that resolves to a raw JSON value.
// TODO(protocol-schema): Replace `unknown` return types with decoded
// Protocol schema types once schema integration is complete. References:
//   - packages/hydra-sdk/src/Protocol/ResponseMessage.ts
//   - packages/hydra-sdk/src/Protocol/CommonMessage.ts
// ---------------------------------------------------------------------------

export interface HeadHttpClient {
  // -- Queries ----------------------------------------------------------------

  /**
   * GET /protocol-parameters
   * Returns the current Hydra protocol parameters.
   */
  readonly getProtocolParameters: () => Effect.Effect<unknown, HeadError>;

  /**
   * GET /snapshot/utxo
   * Returns the confirmed UTxO set for the current snapshot.
   */
  readonly getSnapshotUtxo: () => Effect.Effect<unknown, HeadError>;

  /**
   * GET /snapshot
   * Returns the latest confirmed snapshot.
   */
  readonly getSnapshot: () => Effect.Effect<unknown, HeadError>;

  /**
   * GET /snapshot/last-seen
   * Returns the last-seen snapshot (may be unconfirmed).
   */
  readonly getSnapshotLastSeen: () => Effect.Effect<unknown, HeadError>;

  /**
   * GET /head
   * Returns the current head status (hash, version, etc.).
   */
  readonly getHead: () => Effect.Effect<unknown, HeadError>;

  /**
   * GET /head-initialization
   * Returns details about the Head initialization.
   */
  readonly getHeadInitialization: () => Effect.Effect<unknown, HeadError>;

  /**
   * GET /commits
   * Returns pending commit deposits.
   */
  readonly getCommits: () => Effect.Effect<unknown, HeadError>;

  // -- Commands ---------------------------------------------------------------

  /**
   * POST /commit
   * Submit a commit blueprint transaction (draft commit UTxOs).
   *
   * TODO(protocol-schema): `blueprintTx` should use the Protocol Transaction
   * schema type once integrated.
   */
  readonly submitCommit: (
    blueprintTx: unknown,
  ) => Effect.Effect<unknown, HeadError>;

  /**
   * DELETE /commits/:txId
   * Recover a pending commit deposit.
   */
  readonly recoverCommit: (txId: string) => Effect.Effect<unknown, HeadError>;

  /**
   * POST /decommit
   * Submit a decommit transaction.
   *
   * TODO(protocol-schema): `decommitTx` should use the Protocol Transaction
   * schema type once integrated.
   */
  readonly submitDecommit: (
    decommitTx: unknown,
  ) => Effect.Effect<unknown, HeadError>;

  /**
   * POST /transaction
   * Submit a Layer 2 transaction to the Head.
   *
   * TODO(protocol-schema): `tx` should use the Protocol Transaction schema
   * type once integrated.
   */
  readonly submitTransaction: (
    tx: unknown,
  ) => Effect.Effect<unknown, HeadError>;

  /**
   * POST /cardano-transaction
   * Forward a Layer 1 Cardano transaction through the node.
   *
   * TODO(protocol-schema): `tx` should use the Protocol CardanoTransaction
   * schema type once integrated.
   */
  readonly submitCardanoTransaction: (
    tx: unknown,
  ) => Effect.Effect<unknown, HeadError>;

  /**
   * POST /snapshot
   * Side-load a snapshot (advanced / recovery scenario).
   *
   * TODO(protocol-schema): `snapshot` should use the Protocol Snapshot schema
   * type once integrated.
   */
  readonly sideLoadSnapshot: (
    snapshot: unknown,
  ) => Effect.Effect<unknown, HeadError>;

  /** Tear down any resources held by the HTTP client. */
  readonly dispose: Effect.Effect<void>;
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

const httpError = (method: string, path: string, cause: unknown): HeadError =>
  new HeadError({
    message: `HTTP ${method} ${path} failed`,
    cause,
  });

// ---------------------------------------------------------------------------
// Internal helpers – build Effects that require HttpClient, then provide
// FetchHttpClient.layer at each call site so the returned Effect is fully
// satisfied (E = HeadError, R = never).
// ---------------------------------------------------------------------------

const withFetch = <A>(
  effect: Effect.Effect<A, HeadError, HttpClient.HttpClient>,
): Effect.Effect<A, HeadError> =>
  effect.pipe(Effect.provide(FetchHttpClient.layer));

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a HeadHttpClient wired to the Hydra node at `wsUrl`.
 *
 * Uses `@effect/platform` FetchHttpClient internally. For Node.js, the
 * global `fetch` must be available (Node 18+).
 *
 * In mock mode (url starts with `mock://`) every request resolves with an
 * empty JSON object — suitable for scaffold tests.
 */
export const makeHeadHttpClient = (
  wsUrl: string,
): Effect.Effect<HeadHttpClient> =>
  Effect.sync(() => {
    const baseUrl = deriveHttpBaseUrl(wsUrl);

    if (wsUrl.startsWith("mock://")) {
      return makeMockHttpClient();
    }

    // -- Helpers ---------------------------------------------------------------

    const jsonGet = (path: string): Effect.Effect<unknown, HeadError> =>
      withFetch(
        HttpClient.get(`${baseUrl}${path}`, { acceptJson: true }).pipe(
          Effect.flatMap((response) => response.json),
          Effect.mapError((cause) => httpError("GET", path, cause)),
        ),
      );

    const jsonPost = (
      path: string,
      body: unknown,
    ): Effect.Effect<unknown, HeadError> =>
      withFetch(
        HttpClient.post(`${baseUrl}${path}`, {
          acceptJson: true,
          body: HttpBody.unsafeJson(body),
        }).pipe(
          Effect.flatMap((response) =>
            // Some Hydra endpoints return 200 with a body, others return 202.
            // Normalise both to a JSON body or empty object.
            response.status === 204 || response.status === 202
              ? Effect.succeed({})
              : response.json,
          ),
          Effect.mapError((cause) => httpError("POST", path, cause)),
        ),
      );

    const jsonDelete = (path: string): Effect.Effect<unknown, HeadError> =>
      withFetch(
        HttpClient.del(`${baseUrl}${path}`).pipe(
          Effect.flatMap((response) =>
            response.status === 204 || response.status === 202
              ? Effect.succeed({})
              : response.json,
          ),
          Effect.mapError((cause) => httpError("DELETE", path, cause)),
        ),
      );

    // -- Public API ------------------------------------------------------------

    return {
      // Queries
      getProtocolParameters: () => jsonGet("/protocol-parameters"),
      getSnapshotUtxo: () => jsonGet("/snapshot/utxo"),
      getSnapshot: () => jsonGet("/snapshot"),
      getSnapshotLastSeen: () => jsonGet("/snapshot/last-seen"),
      getHead: () => jsonGet("/head"),
      getHeadInitialization: () => jsonGet("/head-initialization"),
      getCommits: () => jsonGet("/commits"),

      // Commands
      submitCommit: (blueprintTx) => jsonPost("/commit", blueprintTx),
      recoverCommit: (txId) =>
        jsonDelete(`/commits/${encodeURIComponent(txId)}`),
      submitDecommit: (decommitTx) => jsonPost("/decommit", decommitTx),
      submitTransaction: (tx) => jsonPost("/transaction", tx),
      submitCardanoTransaction: (tx) => jsonPost("/cardano-transaction", tx),
      sideLoadSnapshot: (snapshot) => jsonPost("/snapshot", snapshot),

      dispose: Effect.void,
    } satisfies HeadHttpClient;
  });

// ---------------------------------------------------------------------------
// Mock implementation
// ---------------------------------------------------------------------------

const makeMockHttpClient = (): HeadHttpClient => ({
  getProtocolParameters: () => Effect.succeed({}),
  getSnapshotUtxo: () => Effect.succeed({}),
  getSnapshot: () => Effect.succeed({}),
  getSnapshotLastSeen: () => Effect.succeed({}),
  getHead: () => Effect.succeed({}),
  getHeadInitialization: () => Effect.succeed({}),
  getCommits: () => Effect.succeed([]),
  submitCommit: () => Effect.succeed({}),
  recoverCommit: () => Effect.succeed({}),
  submitDecommit: () => Effect.succeed({}),
  submitTransaction: () => Effect.succeed({}),
  submitCardanoTransaction: () => Effect.succeed({}),
  sideLoadSnapshot: () => Effect.succeed({}),
  dispose: Effect.void,
});
