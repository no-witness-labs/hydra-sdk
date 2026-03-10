/**
 * Cluster orchestration for Hydra DevNet.
 *
 * Manages the full lifecycle of a local Cardano + Hydra development
 * environment using Docker containers. Provides an instance-based API
 * for creating, starting, stopping, and removing clusters.
 *
 * ## Architecture
 *
 * A cluster consists of:
 * - **Cardano node** — Block-producing node with fast slot times
 * - **Hydra node** — Layer 2 node with WebSocket/HTTP API
 * - **Docker network** — Isolated bridge network
 * - **Shared volume** — IPC socket for node communication
 *
 * ## Startup Sequence
 *
 * 1. Pull Docker images
 * 2. Generate cryptographic keys (payment + hydra)
 * 3. Build and write genesis configs
 * 4. Create Docker network
 * 5. Start Cardano node → wait for block production
 * 6. Publish Hydra scripts to L1 → capture tx ID
 * 7. Start Hydra node → wait for API readiness
 *
 * ## API Design
 *
 * This module uses an **instance-based pattern** (midday-sdk style):
 *
 * ```typescript
 * // Promise user
 * const cluster = Cluster.make();
 * await cluster.start();
 * console.log(cluster.hydraApiUrl);  // ws://localhost:4001
 * await cluster.stop();
 * await cluster.remove();
 *
 * // Bracket pattern
 * await Cluster.withCluster(async (cluster) => {
 *   // cluster is started, will be stopped + removed on exit
 * });
 *
 * // Effect user
 * yield* cluster.effect.start();
 * yield* cluster.effect.stop();
 *
 * // Effect DI
 * const program = Effect.gen(function* () {
 *   const cluster = yield* ClusterService;
 *   yield* cluster.start();
 * }).pipe(Effect.provide(Cluster.layer()));
 * ```
 *
 * @since 0.1.0
 * @module
 */

import { NodeStream } from "@effect/platform-node";
import Docker from "dockerode";
import { Context, Data, Effect, Layer, Stream } from "effect";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import type { DevNetConfig, ResolvedDevNetConfig } from "./Config.js";
import { DEFAULT_DEVNET_CONFIG } from "./Config.js";
import * as Container from "./Container.js";
import type { GeneratedKeys } from "./Genesis.js";
import * as Genesis from "./Genesis.js";
import * as Health from "./Health.js";
import * as Images from "./Images.js";

// =============================================================================
// Errors
// =============================================================================

/**
 * Error thrown when cluster orchestration operations fail.
 *
 * @since 0.1.0
 * @category errors
 */
export class ClusterError extends Data.TaggedError("ClusterError")<{
  readonly operation: string;
  readonly cluster?: string;
  readonly cause: unknown;
}> {
  override get message(): string {
    const parts = [`[${this.operation}]`];
    if (this.cluster) parts.push(`cluster=${this.cluster}`);
    if (this.cause instanceof Error) {
      parts.push(this.cause.message);
    } else if (
      this.cause &&
      typeof this.cause === "object" &&
      "message" in this.cause
    ) {
      parts.push(String((this.cause as { message: unknown }).message));
    } else if (this.cause) {
      parts.push(String(this.cause));
    }
    return parts.join(" ");
  }
}

// =============================================================================
// Types
// =============================================================================

/**
 * A Hydra DevNet cluster instance.
 *
 * @since 0.1.0
 * @category model
 */
export interface Cluster {
  /** Resolved configuration for this cluster */
  readonly config: ResolvedDevNetConfig;

  /** Container handle for the Cardano node (available after start) */
  readonly cardanoNode: Container.Container | undefined;

  /** Container handle for the Hydra node (available after start) */
  readonly hydraNode: Container.Container | undefined;

  /** WebSocket URL for the Hydra API (e.g. "ws://localhost:4001") */
  readonly hydraApiUrl: string;

  /** HTTP URL for the Hydra API (e.g. "http://localhost:4001") */
  readonly hydraHttpUrl: string;

  /** Hydra scripts transaction ID (available after scripts are published) */
  readonly scriptsTxId: string | undefined;

  /** Generated keys (available after start) */
  readonly keys: GeneratedKeys | undefined;

  /** Temp directory containing config files */
  readonly tempDir: string | undefined;

  // ---------------------------------------------------------------------------
  // Promise Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Start the cluster.
   *
   * Pulls images, generates keys, writes config files, creates Docker network,
   * starts Cardano node, waits for block production, publishes Hydra scripts,
   * starts Hydra node, and waits for API readiness.
   *
   * @throws {ClusterError} When any step in the startup sequence fails
   */
  readonly start: () => Promise<void>;

  /**
   * Stop all containers in the cluster.
   *
   * @throws {ClusterError} When stopping containers fails
   */
  readonly stop: () => Promise<void>;

  /**
   * Remove all containers, networks, and volumes for this cluster.
   * Stops containers first if running.
   *
   * @throws {ClusterError} When removal fails
   */
  readonly remove: () => Promise<void>;

  /**
   * Check if the cluster is running.
   */
  readonly isRunning: () => Promise<boolean>;

  // ---------------------------------------------------------------------------
  // Effect Namespace
  // ---------------------------------------------------------------------------

  /**
   * Raw Effect APIs for advanced composition.
   */
  readonly effect: {
    readonly start: () => Effect.Effect<void, ClusterError>;
    readonly stop: () => Effect.Effect<void, ClusterError>;
    readonly remove: () => Effect.Effect<void, ClusterError>;
  };

  // ---------------------------------------------------------------------------
  // Disposable
  // ---------------------------------------------------------------------------

  [Symbol.asyncDispose]: () => Promise<void>;
}

/**
 * Service interface for Cluster dependency injection.
 *
 * @since 0.1.0
 * @category service
 */
export interface ClusterServiceImpl {
  readonly start: () => Effect.Effect<void, ClusterError>;
  readonly stop: () => Effect.Effect<void, ClusterError>;
  readonly remove: () => Effect.Effect<void, ClusterError>;
  readonly config: ResolvedDevNetConfig;
  readonly hydraApiUrl: string;
  readonly hydraHttpUrl: string;
}

/**
 * Context.Tag for ClusterService dependency injection.
 *
 * @since 0.1.0
 * @category service
 */
export class ClusterService extends Context.Tag("ClusterService")<
  ClusterService,
  ClusterServiceImpl
>() {}

// =============================================================================
// Configuration Resolution
// =============================================================================

/**
 * Resolve user config with defaults.
 * @internal
 */
function resolveConfig(config: DevNetConfig = {}): ResolvedDevNetConfig {
  return {
    clusterName: config.clusterName ?? DEFAULT_DEVNET_CONFIG.clusterName,
    cardanoNode: {
      image:
        config.cardanoNode?.image ?? DEFAULT_DEVNET_CONFIG.cardanoNode.image,
      port: config.cardanoNode?.port ?? DEFAULT_DEVNET_CONFIG.cardanoNode.port,
      submitPort:
        config.cardanoNode?.submitPort ??
        DEFAULT_DEVNET_CONFIG.cardanoNode.submitPort,
      networkMagic:
        config.cardanoNode?.networkMagic ??
        DEFAULT_DEVNET_CONFIG.cardanoNode.networkMagic,
    },
    hydraNode: {
      image: config.hydraNode?.image ?? DEFAULT_DEVNET_CONFIG.hydraNode.image,
      apiPort:
        config.hydraNode?.apiPort ?? DEFAULT_DEVNET_CONFIG.hydraNode.apiPort,
      peerPort:
        config.hydraNode?.peerPort ?? DEFAULT_DEVNET_CONFIG.hydraNode.peerPort,
      monitoringPort:
        config.hydraNode?.monitoringPort ??
        DEFAULT_DEVNET_CONFIG.hydraNode.monitoringPort,
      contestationPeriod:
        config.hydraNode?.contestationPeriod ??
        DEFAULT_DEVNET_CONFIG.hydraNode.contestationPeriod,
      nodeId:
        config.hydraNode?.nodeId ?? DEFAULT_DEVNET_CONFIG.hydraNode.nodeId,
    },
    shelleyGenesisOverrides: config.shelleyGenesisOverrides,
  };
}

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Wait for the cardano-node container to produce blocks by streaming logs.
 *
 * Follows the evolution-sdk pattern: stream container logs using
 * `NodeStream.fromReadable` and `Stream.takeUntil` to detect
 * `Forge.Loop.AdoptedBlock` or `Forge.Loop.NodeIsLeader`.
 *
 * @internal
 */
function waitForBlockProductionEffect(
  containerId: string,
): Effect.Effect<void, ClusterError> {
  const docker = new Docker().getContainer(containerId);

  const awaitBlockProduction = Effect.promise(() =>
    docker.logs({
      stdout: true,
      stderr: true,
      follow: true,
    }),
  ).pipe(
    Stream.fromEffect,
    Stream.flatMap((stream) =>
      NodeStream.fromReadable(
        () => stream,
        (error) =>
          new ClusterError({
            operation: "log-stream",
            cause: error,
          }),
      ),
    ),
    Stream.takeUntil(
      (line) =>
        line.toString().includes("Forge.Loop.AdoptedBlock") ||
        line.toString().includes("Forge.Loop.NodeIsLeader"),
    ),
    Stream.runDrain,
  );

  return awaitBlockProduction;
}

// =============================================================================
// Internal Effect Implementations
// =============================================================================

/**
 * Remove existing containers for this cluster (cleanup from previous runs).
 * @internal
 */
function cleanupExistingEffect(
  config: ResolvedDevNetConfig,
): Effect.Effect<void, ClusterError> {
  return Effect.gen(function* () {
    yield* Effect.mapError(
      Container.effect.removeByName(`${config.clusterName}-hydra-node`),
      (cause) =>
        new ClusterError({
          operation: "cleanup",
          cluster: config.clusterName,
          cause,
        }),
    );
    yield* Effect.mapError(
      Container.effect.removeByName(`${config.clusterName}-cardano-node`),
      (cause) =>
        new ClusterError({
          operation: "cleanup",
          cluster: config.clusterName,
          cause,
        }),
    );
    // Remove stale volume from previous runs to ensure fresh chain state
    yield* Effect.tryPromise({
      try: async () => {
        const docker = new Docker();
        const volumeName = `${config.clusterName}-ipc`;
        try {
          await docker.getVolume(volumeName).remove();
        } catch {
          // Volume may not exist — that's fine
        }
      },
      catch: () => undefined as never,
    }).pipe(Effect.either);
  });
}

/**
 * Start the full cluster orchestration sequence.
 * @internal
 */
function startClusterEffect(
  state: ClusterState,
): Effect.Effect<void, ClusterError> {
  return Effect.gen(function* () {
    const { config } = state;

    // Step 1: Clean up any existing containers from previous runs
    yield* cleanupExistingEffect(config);

    // Step 2: Pull Docker images
    yield* Effect.mapError(
      Effect.tryPromise({
        try: async () => {
          await Images.ensureAvailable(config.cardanoNode.image);
          await Images.ensureAvailable(config.hydraNode.image);
        },
        catch: (cause: unknown) => cause,
      }),
      (cause) =>
        new ClusterError({
          operation: "pull-images",
          cluster: config.clusterName,
          cause,
        }),
    );

    // Step 3: Create temp directory for config files
    const tempDir = yield* Effect.tryPromise({
      try: () => mkdtemp(join(tmpdir(), `${config.clusterName}-`)),
      catch: (cause: unknown) =>
        new ClusterError({
          operation: "create-temp-dir",
          cluster: config.clusterName,
          cause,
        }),
    });
    state.tempDir = tempDir;

    // Step 4: Generate cryptographic keys
    const keys = yield* Effect.mapError(
      Genesis.effect.generateKeys(tempDir, config),
      (cause) =>
        new ClusterError({
          operation: "generate-keys",
          cluster: config.clusterName,
          cause,
        }),
    );
    state.keys = keys;

    // Step 5: Write all config files (genesis, topology, node config, keys)
    yield* Effect.mapError(
      Genesis.effect.writeConfigFiles(
        tempDir,
        keys,
        config,
        config.shelleyGenesisOverrides,
      ),
      (cause) =>
        new ClusterError({
          operation: "write-config",
          cluster: config.clusterName,
          cause,
        }),
    );

    // Step 6: Create Docker network
    const networkName = `${config.clusterName}-network`;
    yield* Effect.tryPromise({
      try: async () => {
        const docker = new Docker();
        const networks = await docker.listNetworks({
          filters: { name: [networkName] },
        });
        const existing = networks.find((n) => n.Name === networkName);
        if (!existing) {
          await docker.createNetwork({
            Name: networkName,
            Driver: "bridge",
          });
        }
      },
      catch: (cause: unknown) =>
        new ClusterError({
          operation: "create-network",
          cluster: config.clusterName,
          cause,
        }),
    });

    // Step 7: Create and start Cardano node
    const cardanoContainer = yield* Effect.mapError(
      Container.effect.createCardanoNode(config, networkName, tempDir),
      (cause) =>
        new ClusterError({
          operation: "create-cardano-node",
          cluster: config.clusterName,
          cause,
        }),
    );
    state.cardanoNode = {
      id: cardanoContainer.id,
      name: `${config.clusterName}-cardano-node`,
    };

    yield* Effect.mapError(
      Container.effect.start(state.cardanoNode),
      (cause) =>
        new ClusterError({
          operation: "start-cardano-node",
          cluster: config.clusterName,
          cause,
        }),
    );

    // Step 8: Wait for Cardano node to produce blocks
    // Stream container logs and wait for block production indicators,
    // same approach as evolution-sdk.
    yield* waitForBlockProductionEffect(state.cardanoNode!.id).pipe(
      Effect.mapError(
        (cause) =>
          new ClusterError({
            operation: "wait-cardano-node",
            cluster: config.clusterName,
            cause,
          }),
      ),
    );

    // Step 8b: Verify cardano-node is still running and socket exists
    yield* Effect.tryPromise({
      try: async () => {
        const docker = new Docker();
        const ctr = docker.getContainer(state.cardanoNode!.id);
        const info = await ctr.inspect();
        if (!info.State.Running) {
          // Grab logs to understand why it crashed
          const logs = await ctr.logs({
            stdout: true,
            stderr: true,
            follow: false,
            tail: 50,
          });
          const logText =
            typeof logs === "string"
              ? logs
              : (logs as Buffer).toString("utf-8");
          throw new Error(
            `Cardano node exited: status=${info.State.Status} exit=${info.State.ExitCode}\nLast logs:\n${logText}`,
          );
        }
      },
      catch: (cause: unknown) =>
        new ClusterError({
          operation: "verify-cardano-socket",
          cluster: config.clusterName,
          cause,
        }),
    });

    // Step 9: Publish Hydra scripts to L1
    const scriptsTxId = yield* Effect.mapError(
      Genesis.effect.publishHydraScripts(tempDir, config),
      (cause) =>
        new ClusterError({
          operation: "publish-hydra-scripts",
          cluster: config.clusterName,
          cause,
        }),
    );
    state.scriptsTxId = scriptsTxId;

    // Step 9b: Query protocol parameters from running cardano-node and write to tempDir
    yield* Effect.mapError(
      Effect.gen(function* () {
        const ppOutput = yield* Container.effect.exec(state.cardanoNode!, [
          "cardano-cli",
          "conway",
          "query",
          "protocol-parameters",
          "--testnet-magic",
          String(config.cardanoNode.networkMagic),
          "--socket-path",
          "/opt/cardano/ipc/node.socket",
          "--out-file",
          "/dev/stdout",
        ]);
        const pp = JSON.parse(ppOutput);
        // Zero out fees for the Hydra L2 ledger (same as hydra demo)
        pp.txFeeFixed = 0;
        pp.txFeePerByte = 0;
        pp.executionUnitPrices = { priceMemory: 0, priceSteps: 0 };
        // Workaround: TestConwayHardForkAtEpoch=0 causes Plutus V2 cost model
        // to return 185 elements instead of 174. Trim to expected size.
        // See: https://github.com/IntersectMBO/cardano-node/issues/5940
        if (pp.costModels?.PlutusV2 && Array.isArray(pp.costModels.PlutusV2)) {
          pp.costModels.PlutusV2 = pp.costModels.PlutusV2.slice(0, 174);
        }
        yield* Effect.tryPromise({
          try: () =>
            writeFile(
              join(tempDir, "protocol-parameters.json"),
              JSON.stringify(pp, null, 2),
            ),
          catch: (cause: unknown) =>
            new ClusterError({
              operation: "write-protocol-params",
              cluster: config.clusterName,
              cause,
            }),
        });
      }),
      (cause) =>
        new ClusterError({
          operation: "query-protocol-params",
          cluster: config.clusterName,
          cause,
        }),
    );

    // Step 10: Create and start Hydra node
    const hydraContainer = yield* Effect.mapError(
      Container.effect.createHydraNode(
        config,
        networkName,
        tempDir,
        scriptsTxId,
      ),
      (cause) =>
        new ClusterError({
          operation: "create-hydra-node",
          cluster: config.clusterName,
          cause,
        }),
    );
    state.hydraNode = {
      id: hydraContainer.id,
      name: `${config.clusterName}-hydra-node`,
    };

    yield* Effect.mapError(
      Container.effect.start(state.hydraNode),
      (cause) =>
        new ClusterError({
          operation: "start-hydra-node",
          cluster: config.clusterName,
          cause,
        }),
    );

    // Step 11: Wait for Hydra API to be ready
    yield* Effect.mapError(
      Health.effect.waitForHydraNode(config.hydraNode.apiPort, {
        timeout: 60000,
        interval: 2000,
      }),
      (cause) =>
        new ClusterError({
          operation: "wait-hydra-api",
          cluster: config.clusterName,
          cause,
        }),
    );
  });
}

/**
 * Stop all containers in the cluster.
 * @internal
 */
function stopClusterEffect(
  state: ClusterState,
): Effect.Effect<void, ClusterError> {
  return Effect.gen(function* () {
    // Stop Hydra node first, then Cardano node
    if (state.hydraNode) {
      yield* Effect.mapError(
        Container.effect.stop(state.hydraNode),
        (cause) =>
          new ClusterError({
            operation: "stop-hydra-node",
            cluster: state.config.clusterName,
            cause,
          }),
      );
    }

    if (state.cardanoNode) {
      yield* Effect.mapError(
        Container.effect.stop(state.cardanoNode),
        (cause) =>
          new ClusterError({
            operation: "stop-cardano-node",
            cluster: state.config.clusterName,
            cause,
          }),
      );
    }
  });
}

/**
 * Remove all containers, networks, volumes, and temp files for the cluster.
 * @internal
 */
function removeClusterEffect(
  state: ClusterState,
): Effect.Effect<void, ClusterError> {
  return Effect.gen(function* () {
    // Remove Hydra node container
    if (state.hydraNode) {
      yield* Effect.mapError(
        Container.effect.remove(state.hydraNode),
        (cause) =>
          new ClusterError({
            operation: "remove-hydra-node",
            cluster: state.config.clusterName,
            cause,
          }),
      ).pipe(Effect.either); // Continue on failure
    }

    // Remove Cardano node container
    if (state.cardanoNode) {
      yield* Effect.mapError(
        Container.effect.remove(state.cardanoNode),
        (cause) =>
          new ClusterError({
            operation: "remove-cardano-node",
            cluster: state.config.clusterName,
            cause,
          }),
      ).pipe(Effect.either); // Continue on failure
    }

    // Remove Docker network
    yield* Effect.tryPromise({
      try: () => Container.removeClusterNetwork(state.config.clusterName),
      catch: (cause: unknown) =>
        new ClusterError({
          operation: "remove-network",
          cluster: state.config.clusterName,
          cause,
        }),
    }).pipe(Effect.either); // Continue on failure

    // Remove Docker volume
    yield* Effect.tryPromise({
      try: async () => {
        const docker = new Docker();
        const volumeName = `${state.config.clusterName}-ipc`;
        try {
          await docker.getVolume(volumeName).remove();
        } catch {
          // Volume may not exist
        }
      },
      catch: (cause: unknown) =>
        new ClusterError({
          operation: "remove-volume",
          cluster: state.config.clusterName,
          cause,
        }),
    }).pipe(Effect.either); // Continue on failure

    // Clean up temp directory
    if (state.tempDir) {
      yield* Effect.tryPromise({
        try: () => rm(state.tempDir!, { recursive: true, force: true }),
        catch: (cause: unknown) =>
          new ClusterError({
            operation: "remove-temp",
            cluster: state.config.clusterName,
            cause,
          }),
      }).pipe(Effect.either); // Continue on failure
    }

    // Reset state
    state.cardanoNode = undefined;
    state.hydraNode = undefined;
    state.scriptsTxId = undefined;
    state.keys = undefined;
    state.tempDir = undefined;
  });
}

// =============================================================================
// Mutable Internal State
// =============================================================================

/**
 * Internal mutable state for a cluster instance.
 * Exposed through the immutable `Cluster` interface.
 * @internal
 */
interface ClusterState {
  readonly config: ResolvedDevNetConfig;
  cardanoNode: Container.Container | undefined;
  hydraNode: Container.Container | undefined;
  scriptsTxId: string | undefined;
  keys: GeneratedKeys | undefined;
  tempDir: string | undefined;
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a new Hydra DevNet cluster instance.
 *
 * The cluster is **not started** — call `cluster.start()` to begin the
 * startup sequence.
 *
 * @param config - Optional configuration overrides
 * @returns A new Cluster instance
 *
 * @example
 * ```typescript
 * const cluster = Cluster.make();
 * await cluster.start();
 * console.log(cluster.hydraApiUrl);
 * // ... interact with the Hydra head ...
 * await cluster.stop();
 * await cluster.remove();
 * ```
 *
 * @since 0.1.0
 * @category constructor
 */
export function make(config?: DevNetConfig): Cluster {
  const resolved = resolveConfig(config);

  const state: ClusterState = {
    config: resolved,
    cardanoNode: undefined,
    hydraNode: undefined,
    scriptsTxId: undefined,
    keys: undefined,
    tempDir: undefined,
  };

  const startEffect_ = () => startClusterEffect(state);
  const stopEffect_ = () => stopClusterEffect(state);
  const removeEffect_ = () => removeClusterEffect(state);

  const cluster: Cluster = {
    get config() {
      return state.config;
    },
    get cardanoNode() {
      return state.cardanoNode;
    },
    get hydraNode() {
      return state.hydraNode;
    },
    get hydraApiUrl() {
      return `ws://localhost:${resolved.hydraNode.apiPort}`;
    },
    get hydraHttpUrl() {
      return `http://localhost:${resolved.hydraNode.apiPort}`;
    },
    get scriptsTxId() {
      return state.scriptsTxId;
    },
    get keys() {
      return state.keys;
    },
    get tempDir() {
      return state.tempDir;
    },

    // Promise lifecycle
    start: () => Effect.runPromise(startEffect_()),
    stop: () => Effect.runPromise(stopEffect_()),
    remove: async () => {
      await Effect.runPromise(stopEffect_().pipe(Effect.either));
      await Effect.runPromise(removeEffect_());
    },
    isRunning: async () => {
      if (!state.cardanoNode || !state.hydraNode) return false;
      const cardanoRunning = await Container.isRunning(state.cardanoNode);
      const hydraRunning = await Container.isRunning(state.hydraNode);
      return cardanoRunning && hydraRunning;
    },

    // Effect namespace
    effect: {
      start: startEffect_,
      stop: stopEffect_,
      remove: removeEffect_,
    },

    // Symbol.asyncDispose
    [Symbol.asyncDispose]: async () => {
      try {
        await Effect.runPromise(stopEffect_().pipe(Effect.either));
        await Effect.runPromise(removeEffect_().pipe(Effect.either));
      } catch {
        // Best-effort cleanup
      }
    },
  };

  return cluster;
}

// =============================================================================
// Bracket Pattern
// =============================================================================

/**
 * Create, start, and use a cluster, then clean up automatically.
 *
 * The cluster is started before the body runs and is guaranteed to be
 * stopped + removed when the body completes (even on error).
 *
 * @param body - Async function that receives the started cluster
 * @param config - Optional configuration overrides
 * @returns The result of the body function
 *
 * @example
 * ```typescript
 * const result = await Cluster.withCluster(async (cluster) => {
 *   console.log(cluster.hydraApiUrl);
 *   // send transactions, open heads, etc.
 *   return 'done';
 * });
 * ```
 *
 * @throws {ClusterError} When cluster lifecycle operations fail
 *
 * @since 0.1.0
 * @category resource
 */
export async function withCluster<A>(
  body: (cluster: Cluster) => Promise<A>,
  config?: DevNetConfig,
): Promise<A> {
  const cluster = make(config);
  await cluster.start();
  try {
    return await body(cluster);
  } finally {
    await cluster.remove();
  }
}

/**
 * Effect bracket for cluster resource management.
 *
 * @since 0.1.0
 * @category resource
 */
export function withClusterEffect<A, E>(
  body: (cluster: Cluster) => Effect.Effect<A, E>,
  config?: DevNetConfig,
): Effect.Effect<A, ClusterError | E> {
  const cluster = make(config);
  return Effect.acquireRelease(
    startClusterEffect({
      config: cluster.config,
      cardanoNode: undefined,
      hydraNode: undefined,
      scriptsTxId: undefined,
      keys: undefined,
      tempDir: undefined,
    }).pipe(Effect.map(() => cluster)),
    (c) =>
      Effect.gen(function* () {
        yield* c.effect.stop().pipe(Effect.either);
        yield* c.effect.remove().pipe(Effect.either);
      }).pipe(Effect.orDie),
  ).pipe(Effect.flatMap(body), Effect.scoped);
}

// =============================================================================
// Effect DI Layers
// =============================================================================

/**
 * Create a Layer that provides ClusterService.
 *
 * @param config - Optional configuration overrides
 * @returns Layer that provides ClusterService
 *
 * @since 0.1.0
 * @category layer
 */
export function layer(config?: DevNetConfig): Layer.Layer<ClusterService> {
  const cluster = make(config);
  return Layer.succeed(ClusterService, {
    start: cluster.effect.start,
    stop: cluster.effect.stop,
    remove: cluster.effect.remove,
    config: cluster.config,
    hydraApiUrl: cluster.hydraApiUrl,
    hydraHttpUrl: cluster.hydraHttpUrl,
  });
}

/**
 * Create a managed Layer that starts the cluster on construction
 * and stops + removes it on disposal.
 *
 * @param config - Optional configuration overrides
 * @returns Scoped layer that manages the cluster lifecycle
 *
 * @since 0.1.0
 * @category layer
 */
export function managedLayer(
  config?: DevNetConfig,
): Layer.Layer<ClusterService, ClusterError> {
  return Layer.scoped(
    ClusterService,
    Effect.gen(function* () {
      const cluster = make(config);

      yield* Effect.acquireRelease(
        cluster.effect.start().pipe(Effect.map(() => cluster)),
        (c) =>
          Effect.gen(function* () {
            yield* c.effect.stop().pipe(Effect.either);
            yield* c.effect.remove().pipe(Effect.either);
          }).pipe(Effect.orDie),
      );

      return {
        start: cluster.effect.start,
        stop: cluster.effect.stop,
        remove: cluster.effect.remove,
        config: cluster.config,
        hydraApiUrl: cluster.hydraApiUrl,
        hydraHttpUrl: cluster.hydraHttpUrl,
      };
    }),
  );
}
