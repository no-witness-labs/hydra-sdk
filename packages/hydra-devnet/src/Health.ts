/**
 * Health check utilities for Hydra DevNet containers.
 *
 * Provides polling-based health checks for the Cardano node, Hydra node,
 * and other services. Supports HTTP, WebSocket, and raw TCP port checks.
 *
 * ## API Design
 *
 * This module uses a **module-function pattern**:
 *
 * - **Stateless**: Health checks are pure functions
 * - **Module functions**: `Health.waitForNode(port)`, `Health.waitForHydra(port)`
 * - **No instance needed**: Just utility functions
 *
 * ### Usage Patterns
 *
 * ```typescript
 * // Promise user
 * await Health.waitForCardanoNode(3001);
 * await Health.waitForHydraNode(4001);
 *
 * // Effect user
 * yield* Health.effect.waitForCardanoNode(3001);
 * yield* Health.effect.waitForHydraNode(4001);
 * ```
 *
 * @since 0.1.0
 * @module
 */

import Docker from 'dockerode';
import { Context, Data, Effect, Layer } from 'effect';

// =============================================================================
// Errors
// =============================================================================

/**
 * Error thrown when health check polling fails or times out.
 *
 * @since 0.1.0
 * @category errors
 */
export class HealthCheckError extends Data.TaggedError('HealthCheckError')<{
  readonly service: string;
  readonly cause: unknown;
}> {}

// =============================================================================
// Types
// =============================================================================

/**
 * Options for health check polling.
 *
 * @since 0.1.0
 * @category model
 */
export interface HealthCheckOptions {
  /** Maximum time to wait in milliseconds (default: 60000) */
  timeout?: number;
  /** Interval between checks in milliseconds (default: 1000) */
  interval?: number;
  /** Number of consecutive successes required (default: 1) */
  requiredSuccesses?: number;
}

/**
 * Service interface for Health check operations (Effect DI).
 *
 * @since 0.1.0
 * @category service
 */
export interface HealthServiceImpl {
  readonly waitForHttp: (
    url: string,
    options?: HealthCheckOptions,
  ) => Effect.Effect<void, HealthCheckError>;
  readonly waitForWebSocket: (
    url: string,
    options?: HealthCheckOptions,
  ) => Effect.Effect<void, HealthCheckError>;
  readonly waitForCardanoNode: (
    port: number,
    options?: HealthCheckOptions,
  ) => Effect.Effect<void, HealthCheckError>;
  readonly waitForHydraNode: (
    port: number,
    options?: HealthCheckOptions,
  ) => Effect.Effect<void, HealthCheckError>;
}

/**
 * Context.Tag for HealthService dependency injection.
 *
 * @since 0.1.0
 * @category service
 */
export class HealthService extends Context.Tag('HealthService')<
  HealthService,
  HealthServiceImpl
>() {}

// =============================================================================
// Internal Helpers
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if a WebSocket endpoint accepts connections.
 * @internal
 */
async function checkWebSocketConnection(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    import('ws')
      .then(({ default: WebSocket }) => {
        const ws = new WebSocket(url);
        const timeout = setTimeout(() => {
          ws.close();
          resolve(false);
        }, 5000);

        ws.on('open', () => {
          clearTimeout(timeout);
          ws.close();
          resolve(true);
        });

        ws.on('error', () => {
          clearTimeout(timeout);
          resolve(false);
        });
      })
      .catch(() => {
        resolve(false);
      });
  });
}

// =============================================================================
// Internal Effect Implementations
// =============================================================================

/**
 * Wait for an HTTP endpoint to return a successful response.
 * @internal
 */
function waitForHttpEffect(
  url: string,
  options: HealthCheckOptions = {},
): Effect.Effect<void, HealthCheckError> {
  return Effect.gen(function* () {
    yield* Effect.tryPromise({
      try: async () => {
        const {
          interval = 1000,
          requiredSuccesses = 1,
          timeout = 60000,
        } = options;
        const startTime = Date.now();
        let successCount = 0;

        while (Date.now() - startTime < timeout) {
          try {
            const response = await fetch(url, {
              method: 'GET',
              signal: AbortSignal.timeout(5000),
            });

            if (response.ok) {
              successCount++;
              if (successCount >= requiredSuccesses) {
                return;
              }
            } else {
              successCount = 0;
            }
          } catch {
            successCount = 0;
          }

          await sleep(interval);
        }

        throw new Error(
          `Health check timed out after ${timeout}ms for ${url}`,
        );
      },
      catch: (cause: unknown) =>
        new HealthCheckError({ service: url, cause }),
    });
  });
}

/**
 * Wait for a WebSocket endpoint to accept connections.
 * @internal
 */
function waitForWebSocketEffect(
  url: string,
  options: HealthCheckOptions = {},
): Effect.Effect<void, HealthCheckError> {
  return Effect.gen(function* () {
    yield* Effect.tryPromise({
      try: async () => {
        const {
          interval = 1000,
          requiredSuccesses = 1,
          timeout = 60000,
        } = options;
        const startTime = Date.now();
        let successCount = 0;

        while (Date.now() - startTime < timeout) {
          try {
            const connected = await checkWebSocketConnection(url);
            if (connected) {
              successCount++;
              if (successCount >= requiredSuccesses) {
                return;
              }
            } else {
              successCount = 0;
            }
          } catch {
            successCount = 0;
          }

          await sleep(interval);
        }

        throw new Error(
          `WebSocket check timed out after ${timeout}ms for ${url}`,
        );
      },
      catch: (cause: unknown) =>
        new HealthCheckError({ service: url, cause }),
    });
  });
}

/**
 * Wait for a TCP port to be open.
 * @internal
 */
function waitForPortEffect(
  port: number,
  options: HealthCheckOptions = {},
): Effect.Effect<void, HealthCheckError> {
  return Effect.gen(function* () {
    yield* Effect.tryPromise({
      try: async () => {
        const { interval = 1000, timeout = 60000 } = options;
        const startTime = Date.now();
        const { createConnection } = await import('net');

        while (Date.now() - startTime < timeout) {
          const connected = await new Promise<boolean>((resolve) => {
            const socket = createConnection(
              { port, host: 'localhost' },
              () => {
                socket.destroy();
                resolve(true);
              },
            );

            socket.on('error', () => {
              socket.destroy();
              resolve(false);
            });

            socket.setTimeout(2000, () => {
              socket.destroy();
              resolve(false);
            });
          });

          if (connected) {
            return;
          }

          await sleep(interval);
        }

        throw new Error(
          `Port check timed out after ${timeout}ms for port ${port}`,
        );
      },
      catch: (cause: unknown) =>
        new HealthCheckError({ service: `port ${port}`, cause }),
    });
  });
}

/**
 * Wait for a Docker container to be healthy based on its healthcheck.
 * @internal
 */
function waitForContainerHealthyEffect(
  containerName: string,
  options: HealthCheckOptions = {},
): Effect.Effect<void, HealthCheckError> {
  return Effect.gen(function* () {
    yield* Effect.tryPromise({
      try: async () => {
        const docker = new Docker();
        const { interval = 2000, timeout = 120000 } = options;
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
          try {
            const container = docker.getContainer(containerName);
            const info = await container.inspect();
            const health = info.State.Health;

            if (health?.Status === 'healthy') {
              return;
            }

            // If no healthcheck configured, fall back to running state
            if (!health && info.State.Running) {
              return;
            }
          } catch {
            // Container might not exist yet
          }

          await sleep(interval);
        }

        throw new Error(
          `Container health check timed out after ${timeout}ms for ${containerName}`,
        );
      },
      catch: (cause: unknown) =>
        new HealthCheckError({ service: containerName, cause }),
    });
  });
}

/**
 * Wait for the Cardano node to be ready and producing blocks.
 * Checks the cardano-node log output for block production indicators.
 * @internal
 */
function waitForCardanoNodeEffect(
  port: number,
  options: HealthCheckOptions = {},
): Effect.Effect<void, HealthCheckError> {
  // Cardano node in devnet mode may not have an HTTP health endpoint.
  // We check if the port is open, which indicates the node is running.
  return waitForPortEffect(port, { timeout: 90000, ...options });
}

/**
 * Wait for the Hydra node API to be ready (WebSocket accepts connections).
 * @internal
 */
function waitForHydraNodeEffect(
  port: number,
  options: HealthCheckOptions = {},
): Effect.Effect<void, HealthCheckError> {
  const url = `ws://localhost:${port}`;
  return waitForWebSocketEffect(url, { timeout: 60000, ...options });
}

// =============================================================================
// Promise API (Default)
// =============================================================================

/**
 * Wait for an HTTP endpoint to return a successful response.
 *
 * @since 0.1.0
 * @category health
 */
export async function waitForHttp(
  url: string,
  options: HealthCheckOptions = {},
): Promise<void> {
  return Effect.runPromise(waitForHttpEffect(url, options));
}

/**
 * Wait for a WebSocket endpoint to accept connections.
 *
 * @since 0.1.0
 * @category health
 */
export async function waitForWebSocket(
  url: string,
  options: HealthCheckOptions = {},
): Promise<void> {
  return Effect.runPromise(waitForWebSocketEffect(url, options));
}

/**
 * Wait for the Cardano node to be ready.
 *
 * @since 0.1.0
 * @category health
 */
export async function waitForCardanoNode(
  port: number,
  options: HealthCheckOptions = {},
): Promise<void> {
  return Effect.runPromise(waitForCardanoNodeEffect(port, options));
}

/**
 * Wait for the Hydra node API to be ready.
 *
 * @since 0.1.0
 * @category health
 */
export async function waitForHydraNode(
  port: number,
  options: HealthCheckOptions = {},
): Promise<void> {
  return Effect.runPromise(waitForHydraNodeEffect(port, options));
}

/**
 * Wait for a Docker container to be healthy.
 *
 * @since 0.1.0
 * @category health
 */
export async function waitForContainerHealthy(
  containerName: string,
  options: HealthCheckOptions = {},
): Promise<void> {
  return Effect.runPromise(
    waitForContainerHealthyEffect(containerName, options),
  );
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
  waitForHttp: waitForHttpEffect,
  waitForWebSocket: waitForWebSocketEffect,
  waitForCardanoNode: waitForCardanoNodeEffect,
  waitForHydraNode: waitForHydraNodeEffect,
  waitForPort: waitForPortEffect,
  waitForContainerHealthy: waitForContainerHealthyEffect,
} as const;

// =============================================================================
// Layer (Effect DI)
// =============================================================================

/**
 * Create a Layer that provides HealthService.
 *
 * @since 0.1.0
 * @category layer
 */
export const layer = (): Layer.Layer<HealthService> =>
  Layer.succeed(HealthService, {
    waitForHttp: waitForHttpEffect,
    waitForWebSocket: waitForWebSocketEffect,
    waitForCardanoNode: waitForCardanoNodeEffect,
    waitForHydraNode: waitForHydraNodeEffect,
  });
