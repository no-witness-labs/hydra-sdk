/**
 * Hydra DevNet — Local Cardano + Hydra development environment.
 *
 * Provides Docker-based cluster management for running a local Hydra
 * Layer 2 environment with a Cardano node as L1.
 *
 * ## Quick Start
 *
 * ```typescript
 * import { Cluster } from '@no-witness-labs/hydra-devnet';
 *
 * // Create and start a devnet cluster
 * const cluster = Cluster.make();
 * await cluster.start();
 *
 * console.log(cluster.hydraApiUrl);  // ws://localhost:4001
 * console.log(cluster.hydraHttpUrl); // http://localhost:4001
 *
 * // ... interact with the Hydra head ...
 *
 * await cluster.stop();
 * await cluster.remove();
 * ```
 *
 * ## Bracket Pattern (auto-cleanup)
 *
 * ```typescript
 * import { Cluster } from '@no-witness-labs/hydra-devnet';
 *
 * await Cluster.withCluster(async (cluster) => {
 *   // cluster is started, will be cleaned up on exit
 *   console.log(cluster.hydraApiUrl);
 * });
 * ```
 *
 * ## Effect User (DI)
 *
 * ```typescript
 * import { Cluster, ClusterService } from '@no-witness-labs/hydra-devnet';
 *
 * const program = Effect.gen(function* () {
 *   const cluster = yield* ClusterService;
 *   yield* cluster.start();
 * }).pipe(Effect.provide(Cluster.managedLayer()));
 * ```
 *
 * @since 0.1.0
 * @module
 */

// =============================================================================
// Modules
// =============================================================================

export * as Cluster from './Cluster.js';
export * as Config from './Config.js';
export * as Container from './Container.js';
export * as Genesis from './Genesis.js';
export * as Health from './Health.js';
export * as Images from './Images.js';

// =============================================================================
// Service Tags (re-exported for convenience)
// =============================================================================

export { ClusterService } from './Cluster.js';
export { ContainerService } from './Container.js';
export { HealthService } from './Health.js';

// =============================================================================
// Error Types (re-exported for pattern matching)
// =============================================================================

export { ClusterError } from './Cluster.js';
export { ContainerError, DockerNotRunningError } from './Container.js';
export { GenesisError } from './Genesis.js';
export { HealthCheckError } from './Health.js';
export { ImageError } from './Images.js';
