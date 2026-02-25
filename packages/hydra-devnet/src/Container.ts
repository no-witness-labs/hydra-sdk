/**
 * Docker container management for Hydra DevNet.
 *
 * Manages lifecycle operations for Docker containers (create, start, stop,
 * remove) and provides utilities for running one-off commands and
 * executing commands inside running containers.
 *
 * ## API Design
 *
 * This module uses a **module-function pattern**:
 *
 * - **Stateless**: Functions operate on Container data
 * - **Module functions**: `Container.start(container)`, `Container.stop(container)`
 * - **Data-oriented**: Container is plain data, not an instance with methods
 *
 * ### Usage Patterns
 *
 * ```typescript
 * // Promise user
 * await Container.start(container);
 * await Container.stop(container);
 * const output = await Container.exec(container, ['cardano-cli', 'query', 'tip']);
 *
 * // Effect user
 * yield* Container.effect.start(container);
 * yield* Container.effect.exec(container, ['cardano-cli', 'query', 'tip']);
 * ```
 *
 * @since 0.1.0
 * @module
 */

import Docker from 'dockerode';
import { Context, Data, Effect, Layer } from 'effect';
import { PassThrough } from 'stream';

import type { ResolvedDevNetConfig } from './Config.js';
import * as Images from './Images.js';

// =============================================================================
// Errors
// =============================================================================

/**
 * Error thrown when Docker container operations fail.
 *
 * @since 0.1.0
 * @category errors
 */
export class ContainerError extends Data.TaggedError('ContainerError')<{
  readonly operation: string;
  readonly container: string;
  readonly cause: unknown;
}> {
  override get message(): string {
    const parts = [`[${this.operation}]`, this.container];
    if (this.cause instanceof Error) {
      parts.push(this.cause.message);
    } else if (this.cause) {
      parts.push(String(this.cause));
    }
    return parts.join(' ');
  }
}

/**
 * Error thrown when Docker is not available or not running.
 *
 * @since 0.1.0
 * @category errors
 */
export class DockerNotRunningError extends Data.TaggedError(
  'DockerNotRunningError',
)<{
  readonly cause: unknown;
}> {}

// =============================================================================
// Types
// =============================================================================

/**
 * Represents a Docker container.
 *
 * @since 0.1.0
 * @category model
 */
export interface Container {
  readonly id: string;
  readonly name: string;
}

/**
 * Service interface for Container operations (Effect DI).
 *
 * @since 0.1.0
 * @category service
 */
export interface ContainerServiceImpl {
  readonly start: (
    container: Container,
  ) => Effect.Effect<void, ContainerError>;
  readonly stop: (container: Container) => Effect.Effect<void, ContainerError>;
  readonly remove: (
    container: Container,
  ) => Effect.Effect<void, ContainerError>;
  readonly getStatus: (
    container: Container,
  ) => Effect.Effect<Docker.ContainerInspectInfo | undefined, ContainerError>;
  readonly isRunning: (
    container: Container,
  ) => Effect.Effect<boolean, never>;
}

/**
 * Context.Tag for ContainerService dependency injection.
 *
 * @since 0.1.0
 * @category service
 */
export class ContainerService extends Context.Tag('ContainerService')<
  ContainerService,
  ContainerServiceImpl
>() {}

// =============================================================================
// Internal Effect Implementations
// =============================================================================

/**
 * Start a container.
 * @internal
 */
function startEffect(
  container: Container,
): Effect.Effect<void, ContainerError> {
  return Effect.tryPromise({
    try: async () => {
      const docker = new Docker();
      await docker.getContainer(container.id).start();
    },
    catch: (cause: unknown) =>
      new ContainerError({
        operation: 'start',
        container: container.name,
        cause,
      }),
  });
}

/**
 * Stop a container if running.
 * @internal
 */
function stopEffect(
  container: Container,
): Effect.Effect<void, ContainerError> {
  return Effect.gen(function* () {
    yield* Effect.tryPromise({
      try: async () => {
        const docker = new Docker();
        const dockerContainer = docker.getContainer(container.id);
        const info = await dockerContainer.inspect();
        if (info.State.Running) {
          await dockerContainer.stop();
        }
      },
      catch: (cause: unknown) =>
        new ContainerError({
          operation: 'stop',
          container: container.name,
          cause,
        }),
    });
  });
}

/**
 * Remove a container (stops first if running).
 * @internal
 */
function removeEffect(
  container: Container,
): Effect.Effect<void, ContainerError> {
  return Effect.gen(function* () {
    yield* stopEffect(container);
    yield* Effect.tryPromise({
      try: async () => {
        const docker = new Docker();
        await docker.getContainer(container.id).remove();
      },
      catch: (cause: unknown) =>
        new ContainerError({
          operation: 'remove',
          container: container.name,
          cause,
        }),
    });
  });
}

/**
 * Get container status/inspection info.
 * @internal
 */
function getStatusEffect(
  container: Container,
): Effect.Effect<Docker.ContainerInspectInfo | undefined, ContainerError> {
  return Effect.tryPromise({
    try: async () => {
      const docker = new Docker();
      return await docker.getContainer(container.id).inspect();
    },
    catch: (cause: unknown) =>
      new ContainerError({
        operation: 'inspect',
        container: container.name,
        cause,
      }),
  });
}

/**
 * Execute a command inside a running container and return stdout.
 * Properly handles Docker's multiplexed streams.
 * @internal
 */
function execEffect(
  container: Container,
  command: Array<string>,
): Effect.Effect<string, ContainerError> {
  return Effect.gen(function* () {
    const docker = new Docker();
    const dockerContainer = docker.getContainer(container.id);

    const exec = yield* Effect.tryPromise({
      try: () =>
        dockerContainer.exec({
          Cmd: command,
          AttachStdout: true,
          AttachStderr: true,
        }),
      catch: (cause: unknown) =>
        new ContainerError({
          operation: 'exec',
          container: container.name,
          cause,
        }),
    });

    const stream = yield* Effect.tryPromise({
      try: () => exec.start({ Detach: false }),
      catch: (cause: unknown) =>
        new ContainerError({
          operation: 'exec',
          container: container.name,
          cause,
        }),
    });

    // Demux Docker stream to separate stdout/stderr
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    docker.modem.demuxStream(stream, stdout, stderr);

    let output = '';

    stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });

    stderr.on('data', (_chunk: Buffer) => {
      // Capture stderr but don't fail — some tools write info to stderr
    });

    yield* Effect.promise(
      () =>
        new Promise<void>((resolve) => {
          stream.on('end', resolve);
        }),
    );

    return output.trim();
  });
}

/**
 * Run a one-off Docker container and return its stdout output.
 * The container is automatically removed after completion.
 *
 * Used for key generation, script publishing, and other setup tasks.
 * @internal
 */
function runOnceEffect(
  image: string,
  command: Array<string>,
  binds: Array<string> = [],
  networkMode?: string,
): Effect.Effect<string, ContainerError> {
  return Effect.gen(function* () {
    const docker = new Docker();

    const createOptions: Docker.ContainerCreateOptions = {
      Image: image,
      Cmd: command,
      HostConfig: {
        Binds: binds.length > 0 ? binds : undefined,
        NetworkMode: networkMode,
        AutoRemove: false,
      },
      Tty: false,
    };

    const container = yield* Effect.tryPromise({
      try: () => docker.createContainer(createOptions),
      catch: (cause: unknown) =>
        new ContainerError({
          operation: 'run-once-create',
          container: image,
          cause,
        }),
    });

    yield* Effect.tryPromise({
      try: () => container.start(),
      catch: (cause: unknown) =>
        new ContainerError({
          operation: 'run-once-start',
          container: image,
          cause,
        }),
    });

    // Wait for completion
    const waitResult = yield* Effect.tryPromise({
      try: () => container.wait() as Promise<{ StatusCode: number }>,
      catch: (cause: unknown) =>
        new ContainerError({
          operation: 'run-once-wait',
          container: image,
          cause,
        }),
    });

    // Get logs (stdout + stderr)
    const [stdout, stderr] = yield* Effect.tryPromise({
      try: async () => {
        const out = await container.logs({
          stdout: true,
          stderr: false,
          follow: false,
        });
        const err = await container.logs({
          stdout: false,
          stderr: true,
          follow: false,
        });
        return [
          typeof out === 'string' ? out : (out as Buffer).toString('utf-8'),
          typeof err === 'string' ? err : (err as Buffer).toString('utf-8'),
        ] as const;
      },
      catch: (cause: unknown) =>
        new ContainerError({
          operation: 'run-once-logs',
          container: image,
          cause,
        }),
    });

    // Clean up container
    yield* Effect.tryPromise({
      try: () => container.remove(),
      catch: () =>
        new ContainerError({
          operation: 'run-once-cleanup',
          container: image,
          cause: 'Failed to remove one-off container',
        }),
    }).pipe(Effect.either); // Don't fail on cleanup errors

    if (waitResult.StatusCode !== 0) {
      const combined = [stdout.trim(), stderr.trim()]
        .filter(Boolean)
        .join('\n');
      return yield* Effect.fail(
        new ContainerError({
          operation: 'run-once',
          container: image,
          cause: `Container exited with code ${waitResult.StatusCode}: ${combined}`,
        }),
      );
    }

    return stdout.trim();
  });
}

/**
 * Find a container by name.
 * @internal
 */
function findByNameEffect(
  containerName: string,
): Effect.Effect<Docker.Container | undefined, ContainerError> {
  return Effect.tryPromise({
    try: async () => {
      const docker = new Docker();
      const containers = await docker.listContainers({ all: true });
      const found = containers.find((c) =>
        c.Names.includes(`/${containerName}`),
      );
      return found ? docker.getContainer(found.Id) : undefined;
    },
    catch: (cause: unknown) =>
      new ContainerError({
        operation: 'lookup',
        container: containerName,
        cause,
      }),
  });
}

/**
 * Remove a container by name if it exists.
 * @internal
 */
function removeByNameEffect(
  containerName: string,
): Effect.Effect<void, ContainerError> {
  return Effect.gen(function* () {
    const existing = yield* findByNameEffect(containerName);
    if (existing) {
      yield* Effect.tryPromise({
        try: async () => {
          const info = await existing.inspect();
          if (info.State.Running) {
            await existing.stop();
          }
          await existing.remove();
        },
        catch: (cause: unknown) =>
          new ContainerError({
            operation: 'remove',
            container: containerName,
            cause,
          }),
      });
    }
  });
}

// =============================================================================
// Docker Network & Volume Helpers
// =============================================================================

/**
 * Create or get a Docker network for the cluster.
 * @internal
 */
async function ensureNetwork(networkName: string): Promise<Docker.Network> {
  const docker = new Docker();
  const networks = await docker.listNetworks({
    filters: { name: [networkName] },
  });
  const existing = networks.find((n) => n.Name === networkName);
  if (existing) {
    return docker.getNetwork(existing.Id!);
  }
  return docker.createNetwork({ Name: networkName, Driver: 'bridge' });
}

/**
 * Remove a Docker network if it exists.
 * @internal
 */
async function removeNetwork(networkName: string): Promise<void> {
  const docker = new Docker();
  const networks = await docker.listNetworks({
    filters: { name: [networkName] },
  });
  const existing = networks.find((n) => n.Name === networkName);
  if (existing) {
    await docker.getNetwork(existing.Id!).remove();
  }
}

/**
 * Remove the Docker network for a cluster.
 *
 * @since 0.1.0
 * @category utilities
 * @internal
 */
export async function removeClusterNetwork(
  clusterName: string,
): Promise<void> {
  try {
    await removeNetwork(`${clusterName}-network`);
  } catch {
    // Ignore network removal errors
  }
}

// =============================================================================
// Container Factory Functions
// =============================================================================

/**
 * Create the Cardano node container.
 * @internal
 */
function createCardanoNodeEffect(
  config: ResolvedDevNetConfig,
  networkName: string,
  tempDir: string,
): Effect.Effect<Docker.Container, ContainerError> {
  return Effect.gen(function* () {
    return yield* Effect.tryPromise({
      try: async () => {
        const docker = new Docker();
        const containerName = `${config.clusterName}-cardano-node`;
        const volumeName = `${config.clusterName}-ipc`;

        await Images.ensureAvailable(config.cardanoNode.image);
        await ensureNetwork(networkName);

        return docker.createContainer({
          Image: config.cardanoNode.image,
          name: containerName,
          ExposedPorts: {
            [`${config.cardanoNode.port}/tcp`]: {},
            [`${config.cardanoNode.submitPort}/tcp`]: {},
          },
          HostConfig: {
            PortBindings: {
              [`${config.cardanoNode.port}/tcp`]: [
                { HostPort: String(config.cardanoNode.port) },
              ],
              [`${config.cardanoNode.submitPort}/tcp`]: [
                { HostPort: String(config.cardanoNode.submitPort) },
              ],
            },
            Binds: [
              `${tempDir}:/opt/cardano/config:ro`,
              `${tempDir}:/opt/cardano/keys:ro`,
              `${volumeName}:/opt/cardano/ipc`,
            ],
            NetworkMode: networkName,
          },
          Env: [
            `CARDANO_NODE_SOCKET_PATH=/opt/cardano/ipc/node.socket`,
            `CARDANO_BLOCK_PRODUCER=true`,
            `CARDANO_NETWORK_MAGIC=${config.cardanoNode.networkMagic}`,
          ],
          Cmd: [
            'run',
            '--topology',
            '/opt/cardano/config/topology.json',
            '--database-path',
            '/opt/cardano/data',
            '--socket-path',
            '/opt/cardano/ipc/node.socket',
            '--host-addr',
            '0.0.0.0',
            '--port',
            String(config.cardanoNode.port),
            '--config',
            '/opt/cardano/config/config.json',
            '--shelley-kes-key',
            '/opt/cardano/config/kes.skey',
            '--shelley-vrf-key',
            '/opt/cardano/config/vrf.skey',
            '--shelley-operational-certificate',
            '/opt/cardano/config/pool.cert',
          ],
        });
      },
      catch: (cause: unknown) =>
        new ContainerError({
          operation: 'create',
          container: `${config.clusterName}-cardano-node`,
          cause,
        }),
    });
  });
}

/**
 * Create the Hydra node container.
 * @internal
 */
function createHydraNodeEffect(
  config: ResolvedDevNetConfig,
  networkName: string,
  tempDir: string,
  scriptsTxId: string,
): Effect.Effect<Docker.Container, ContainerError> {
  return Effect.gen(function* () {
    return yield* Effect.tryPromise({
      try: async () => {
        const docker = new Docker();
        const containerName = `${config.clusterName}-hydra-node`;
        const volumeName = `${config.clusterName}-ipc`;

        await Images.ensureAvailable(config.hydraNode.image);
        await ensureNetwork(networkName);

        return docker.createContainer({
          Image: config.hydraNode.image,
          name: containerName,
          ExposedPorts: {
            [`${config.hydraNode.apiPort}/tcp`]: {},
            [`${config.hydraNode.peerPort}/tcp`]: {},
            [`${config.hydraNode.monitoringPort}/tcp`]: {},
          },
          HostConfig: {
            PortBindings: {
              [`${config.hydraNode.apiPort}/tcp`]: [
                { HostPort: String(config.hydraNode.apiPort) },
              ],
              [`${config.hydraNode.peerPort}/tcp`]: [
                { HostPort: String(config.hydraNode.peerPort) },
              ],
              [`${config.hydraNode.monitoringPort}/tcp`]: [
                { HostPort: String(config.hydraNode.monitoringPort) },
              ],
            },
            Binds: [
              `${tempDir}:/config:ro`,
              `${volumeName}:/ipc`,
            ],
            NetworkMode: networkName,
          },
          Cmd: [
            '--node-id',
            config.hydraNode.nodeId,
            '--api-host',
            '0.0.0.0',
            '--api-port',
            String(config.hydraNode.apiPort),
            '--listen',
            `0.0.0.0:${config.hydraNode.peerPort}`,
            '--monitoring-port',
            String(config.hydraNode.monitoringPort),
            '--persistence-dir',
            '/data',
            '--hydra-signing-key',
            '/config/hydra.sk',
            '--cardano-signing-key',
            '/config/payment.skey',
            '--ledger-protocol-parameters',
            '/config/protocol-parameters.json',
            '--testnet-magic',
            String(config.cardanoNode.networkMagic),
            '--node-socket',
            '/ipc/node.socket',
            '--hydra-scripts-tx-id',
            scriptsTxId,
            '--contestation-period',
            `${config.hydraNode.contestationPeriod}s`,
          ],
        });
      },
      catch: (cause: unknown) =>
        new ContainerError({
          operation: 'create',
          container: `${config.clusterName}-hydra-node`,
          cause,
        }),
    });
  });
}

// =============================================================================
// Promise API (Default)
// =============================================================================

/**
 * Start a container.
 *
 * @since 0.1.0
 * @category lifecycle
 */
export async function start(container: Container): Promise<void> {
  return Effect.runPromise(startEffect(container));
}

/**
 * Stop a container.
 *
 * @since 0.1.0
 * @category lifecycle
 */
export async function stop(container: Container): Promise<void> {
  return Effect.runPromise(stopEffect(container));
}

/**
 * Remove a container (stops it first if running).
 *
 * @since 0.1.0
 * @category lifecycle
 */
export async function remove(container: Container): Promise<void> {
  return Effect.runPromise(removeEffect(container));
}

/**
 * Get container status information.
 *
 * @since 0.1.0
 * @category inspection
 */
export async function getStatus(
  container: Container,
): Promise<Docker.ContainerInspectInfo | undefined> {
  return Effect.runPromise(getStatusEffect(container));
}

/**
 * Check if a container is running.
 *
 * @since 0.1.0
 * @category inspection
 */
export async function isRunning(container: Container): Promise<boolean> {
  try {
    const status = await getStatus(container);
    return status?.State.Running ?? false;
  } catch {
    return false;
  }
}

/**
 * Execute a command inside a running container and return stdout.
 *
 * @example
 * ```typescript
 * const output = await Container.exec(cluster.cardanoNode, [
 *   'cardano-cli', 'query', 'tip',
 *   '--socket-path', '/opt/cardano/ipc/node.socket',
 *   '--testnet-magic', '42',
 * ]);
 * ```
 *
 * @since 0.1.0
 * @category execution
 */
export async function exec(
  container: Container,
  command: Array<string>,
): Promise<string> {
  return Effect.runPromise(execEffect(container, command));
}

/**
 * Run a one-off Docker container and return stdout.
 * Container is automatically removed after completion.
 *
 * @since 0.1.0
 * @category execution
 */
export async function runOnce(
  image: string,
  command: Array<string>,
  binds: Array<string> = [],
  networkMode?: string,
): Promise<string> {
  return Effect.runPromise(runOnceEffect(image, command, binds, networkMode));
}

/**
 * Find a container by name.
 *
 * @since 0.1.0
 * @category utilities
 * @internal
 */
export async function findByName(
  containerName: string,
): Promise<Docker.Container | undefined> {
  return Effect.runPromise(findByNameEffect(containerName));
}

/**
 * Remove a container by name if it exists.
 *
 * @since 0.1.0
 * @category utilities
 * @internal
 */
export async function removeByName(containerName: string): Promise<void> {
  return Effect.runPromise(removeByNameEffect(containerName));
}

// =============================================================================
// Effect Namespace (Advanced)
// =============================================================================

/**
 * Raw Effect APIs for advanced users.
 *
 * @since 0.1.0
 * @category effect
 */
export const effect = {
  start: startEffect,
  stop: stopEffect,
  remove: removeEffect,
  getStatus: getStatusEffect,
  exec: execEffect,
  runOnce: runOnceEffect,
  findByName: findByNameEffect,
  removeByName: removeByNameEffect,
  createCardanoNode: createCardanoNodeEffect,
  createHydraNode: createHydraNodeEffect,
} as const;

// =============================================================================
// Layer (Effect DI)
// =============================================================================

/**
 * Create a Layer that provides ContainerService.
 *
 * @since 0.1.0
 * @category layer
 */
export const layer = (): Layer.Layer<ContainerService> =>
  Layer.succeed(ContainerService, {
    start: startEffect,
    stop: stopEffect,
    remove: removeEffect,
    getStatus: getStatusEffect,
    isRunning: (container) =>
      getStatusEffect(container).pipe(
        Effect.map((status) => status?.State.Running ?? false),
        Effect.catchAll(() => Effect.succeed(false)),
      ),
  });
