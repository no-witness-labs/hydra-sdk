/**
 * Docker image management utilities for Hydra DevNet.
 *
 * Handles checking availability, pulling, and ensuring Docker images
 * are ready before container creation.
 *
 * ## API Design
 *
 * This module uses a **module-function pattern**:
 *
 * - **Stateless**: Functions operate on image names
 * - **Effect-first**: Internal implementation uses Effect
 * - **Promise wrappers**: Convenience functions for simple usage
 *
 * ### Usage Patterns
 *
 * ```typescript
 * // Promise user
 * await Images.ensureAvailable('ghcr.io/cardano-scaling/hydra-node:0.21.0');
 *
 * // Effect user
 * yield* Images.effect.ensureAvailable('ghcr.io/cardano-scaling/hydra-node:0.21.0');
 * ```
 *
 * @since 0.1.0
 * @module
 */

import Docker from "dockerode";
import { Data, Effect } from "effect";

// =============================================================================
// Errors
// =============================================================================

/**
 * Error thrown when Docker image operations fail.
 *
 * @since 0.1.0
 * @category errors
 */
export class ImageError extends Data.TaggedError("ImageError")<{
  readonly reason: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

// =============================================================================
// Internal Effect Implementations
// =============================================================================

/**
 * Internal Effect for checking if a Docker image exists locally.
 * @internal
 */
const isAvailableEffect = (
  imageName: string,
): Effect.Effect<boolean, ImageError> =>
  Effect.tryPromise({
    try: () => {
      const docker = new Docker();
      return docker
        .listImages({ filters: { reference: [imageName] } })
        .then((images) => images.length > 0);
    },
    catch: (cause) =>
      new ImageError({
        reason: "image_inspection_failed",
        message: `Failed to check if image '${imageName}' is available.`,
        cause,
      }),
  });

/**
 * Internal Effect for pulling a Docker image with progress logging.
 * @internal
 */
const pullEffect = (imageName: string): Effect.Effect<void, ImageError> =>
  Effect.gen(function* () {
    const docker = new Docker();

    // eslint-disable-next-line no-console
    console.log(`[HydraDevNet] Pulling Docker image: ${imageName}`);
    // eslint-disable-next-line no-console
    console.log(`[HydraDevNet] This may take a few minutes on first run...`);

    const stream = yield* Effect.tryPromise({
      try: () => docker.pull(imageName),
      catch: (cause) =>
        new ImageError({
          reason: "image_pull_failed",
          message: `Failed to pull image '${imageName}'. Check internet connection and image name.`,
          cause,
        }),
    });

    yield* Effect.tryPromise({
      try: () =>
        new Promise<void>((resolve, reject) => {
          docker.modem.followProgress(
            stream,
            (err: Error | null) => {
              if (err) reject(err);
              else resolve();
            },
            (event: { status?: string; id?: string }) => {
              if (
                event.status &&
                event.status !== "Downloading" &&
                event.status !== "Extracting"
              ) {
                // eslint-disable-next-line no-console
                console.log(
                  `[HydraDevNet] ${event.status}${event.id ? ` ${event.id}` : ""}`,
                );
              }
            },
          );
        }),
      catch: (cause) =>
        new ImageError({
          reason: "image_pull_failed",
          message: `Failed to complete image pull for '${imageName}'.`,
          cause,
        }),
    });

    // eslint-disable-next-line no-console
    console.log(`[HydraDevNet] ✓ Image ready: ${imageName}`);
  });

/**
 * Internal Effect for ensuring an image is available, pulling if necessary.
 * @internal
 */
const ensureAvailableEffect = (
  imageName: string,
): Effect.Effect<void, ImageError> =>
  Effect.gen(function* () {
    const available = yield* isAvailableEffect(imageName);
    if (!available) {
      yield* pullEffect(imageName);
    }
  });

// =============================================================================
// Promise API (Default)
// =============================================================================

/**
 * Check if a Docker image exists locally.
 *
 * @since 0.1.0
 * @category inspection
 */
export async function isAvailable(imageName: string): Promise<boolean> {
  return Effect.runPromise(isAvailableEffect(imageName));
}

/**
 * Pull a Docker image with progress logging.
 *
 * @since 0.1.0
 * @category management
 */
export async function pull(imageName: string): Promise<void> {
  return Effect.runPromise(pullEffect(imageName));
}

/**
 * Ensure image is available, pull if necessary.
 *
 * @since 0.1.0
 * @category management
 */
export async function ensureAvailable(imageName: string): Promise<void> {
  return Effect.runPromise(ensureAvailableEffect(imageName));
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
  isAvailable: isAvailableEffect,
  pull: pullEffect,
  ensureAvailable: ensureAvailableEffect,
} as const;
