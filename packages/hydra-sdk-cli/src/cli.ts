import * as Command from "@effect/cli/Command";
import * as Options from "@effect/cli/Options";
import { Head } from "@no-witness-labs/hydra-sdk";
import { Config, Effect, Schedule } from "effect";

// ---------------------------------------------------------------------------
// Global Options (shared by all commands that need a head connection)
// ---------------------------------------------------------------------------

const urlOption = Options.text("url").pipe(
  Options.withFallbackConfig(Config.string("HYDRA_NODE_URL")),
  Options.withDescription(
    "Hydra node WebSocket URL (e.g. ws://localhost:4001). Falls back to HYDRA_NODE_URL env var.",
  ),
);

const jsonOption = Options.boolean("json").pipe(
  Options.withDefault(false),
  Options.withDescription("Output results as JSON"),
);

const headOptions = { json: jsonOption, url: urlOption };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const output = (json: boolean, data: Record<string, unknown>): string =>
  json
    ? JSON.stringify(data)
    : Object.entries(data)
        .map(([k, v]) => `${k}: ${String(v)}`)
        .join(", ");

/**
 * Build a Head.layer() from the resolved URL and run a command effect
 * that depends on HydraHeadService. Layer is only created per-command,
 * so --help / other non-head commands don't trigger a WS connection.
 */
const withHeadLayer = (
  url: string,
  program: Effect.Effect<void, Head.HeadError, Head.HydraHeadService>,
): Effect.Effect<void> =>
  program.pipe(
    Effect.provide(Head.layer({ url })),
    Effect.catchTag("HeadError", (e) =>
      Effect.logError(`Error: ${e.message}`),
    ),
  );

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

const watchOption = Options.boolean("watch").pipe(
  Options.withAlias("w"),
  Options.withDefault(false),
  Options.withDescription("Continuously watch status (1s interval)"),
);

export const statusCommand = Command.make("status", {
  ...headOptions,
  watch: watchOption,
}).pipe(
  Command.withDescription("Show current head status"),
  Command.withHandler(({ json, url, watch }) =>
    withHeadLayer(
      url,
      Effect.gen(function* () {
        const head = yield* Head.HydraHeadService;
        const log = () =>
          Effect.logInfo(
            output(json, {
              headId: head.headId ?? "none",
              status: head.getState(),
            }),
          );
        if (watch) {
          yield* log().pipe(Effect.repeat(Schedule.spaced("1 second")));
        } else {
          yield* log();
        }
      }),
    ),
  ),
);

export const initCommand = Command.make("init", headOptions).pipe(
  Command.withDescription("Initialize a new Hydra head"),
  Command.withHandler(({ json, url }) =>
    withHeadLayer(
      url,
      Effect.gen(function* () {
        const head = yield* Head.HydraHeadService;
        yield* Effect.logInfo("Sending Init command...");
        yield* head.effect.init();
        yield* Effect.logInfo(
          output(json, { result: "success", status: head.getState() }),
        );
      }),
    ),
  ),
);

export const abortCommand = Command.make("abort", headOptions).pipe(
  Command.withDescription("Abort head initialization"),
  Command.withHandler(({ json, url }) =>
    withHeadLayer(
      url,
      Effect.gen(function* () {
        const head = yield* Head.HydraHeadService;
        yield* Effect.logInfo("Sending Abort command...");
        yield* head.effect.abort();
        yield* Effect.logInfo(
          output(json, { result: "success", status: head.getState() }),
        );
      }),
    ),
  ),
);

export const commitCommand = Command.make("commit", headOptions).pipe(
  Command.withDescription("Send an empty commit (REST)"),
  Command.withHandler(({ json, url }) =>
    withHeadLayer(
      url,
      Effect.gen(function* () {
        const head = yield* Head.HydraHeadService;
        yield* Effect.logInfo("Sending empty Commit...");
        yield* head.effect.commit({});
        yield* Effect.logInfo(
          output(json, { result: "success", status: head.getState() }),
        );
      }),
    ),
  ),
);

export const closeCommand = Command.make("close", headOptions).pipe(
  Command.withDescription("Close the Hydra head"),
  Command.withHandler(({ json, url }) =>
    withHeadLayer(
      url,
      Effect.gen(function* () {
        const head = yield* Head.HydraHeadService;
        yield* Effect.logInfo("Sending Close command...");
        yield* head.effect.close();
        yield* Effect.logInfo(
          output(json, { result: "success", status: head.getState() }),
        );
      }),
    ),
  ),
);

export const contestCommand = Command.make("contest", headOptions).pipe(
  Command.withDescription("Contest head closure with newer snapshot"),
  Command.withHandler(({ json, url }) =>
    withHeadLayer(
      url,
      Effect.gen(function* () {
        const head = yield* Head.HydraHeadService;
        yield* Effect.logInfo("Sending Contest command...");
        yield* head.effect.contest();
        yield* Effect.logInfo(
          output(json, { result: "success", status: head.getState() }),
        );
      }),
    ),
  ),
);

export const fanoutCommand = Command.make("fanout", headOptions).pipe(
  Command.withDescription("Fan out from closed head to L1"),
  Command.withHandler(({ json, url }) =>
    withHeadLayer(
      url,
      Effect.gen(function* () {
        const head = yield* Head.HydraHeadService;
        yield* Effect.logInfo("Sending Fanout command...");
        yield* head.effect.fanout();
        yield* Effect.logInfo(
          output(json, { result: "success", status: head.getState() }),
        );
      }),
    ),
  ),
);

const recoverTxIdOption = Options.text("tx-id").pipe(
  Options.withDescription("Transaction ID of the deposit to recover"),
);

export const recoverCommand = Command.make("recover", {
  ...headOptions,
  txId: recoverTxIdOption,
}).pipe(
  Command.withDescription("Recover a failed incremental commit deposit"),
  Command.withHandler(({ json, txId, url }) =>
    withHeadLayer(
      url,
      Effect.gen(function* () {
        const head = yield* Head.HydraHeadService;
        yield* Effect.logInfo(`Recovering deposit ${txId}...`);
        yield* head.effect.recover(txId);
        yield* Effect.logInfo(
          output(json, {
            recovered: txId,
            result: "success",
            status: head.getState(),
          }),
        );
      }),
    ),
  ),
);

const decommitCborOption = Options.text("tx-cbor").pipe(
  Options.withDescription("CBOR hex of the decommit transaction"),
);

const decommitTxIdOption = Options.text("tx-id").pipe(
  Options.withDescription("Transaction ID of the decommit transaction"),
);

export const decommitCommand = Command.make("decommit", {
  ...headOptions,
  txCbor: decommitCborOption,
  txId: decommitTxIdOption,
}).pipe(
  Command.withDescription("Decommit UTxOs from head back to L1"),
  Command.withHandler(({ json, txCbor, txId, url }) =>
    withHeadLayer(
      url,
      Effect.gen(function* () {
        const head = yield* Head.HydraHeadService;
        yield* Effect.logInfo("Sending Decommit command...");
        yield* head.effect.decommit({
          cborHex: txCbor,
          description: "Ledger Cddl Format",
          txId,
          type: "Tx ConwayEra",
        });
        yield* Effect.logInfo(
          output(json, { result: "success", status: head.getState() }),
        );
      }),
    ),
  ),
);

export const connectCommand = Command.make("connect", headOptions).pipe(
  Command.withDescription("Test connection to a Hydra node"),
  Command.withHandler(({ json, url }) =>
    withHeadLayer(
      url,
      Effect.gen(function* () {
        const head = yield* Head.HydraHeadService;
        yield* Effect.logInfo(
          output(json, {
            headId: head.headId ?? "none",
            result: "connected",
            status: head.getState(),
            url,
          }),
        );
      }),
    ),
  ),
);

// ---------------------------------------------------------------------------
// Root Command
// ---------------------------------------------------------------------------

export const rootCommand = Command.make("hydra").pipe(
  Command.withDescription("Hydra head lifecycle manager"),
  Command.withSubcommands([
    statusCommand,
    initCommand,
    abortCommand,
    commitCommand,
    closeCommand,
    contestCommand,
    fanoutCommand,
    recoverCommand,
    decommitCommand,
    connectCommand,
  ]),
);

export const runCli = Command.run(rootCommand, {
  name: "hydra",
  version: "0.1.0",
});
