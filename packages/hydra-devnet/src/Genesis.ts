/**
 * Genesis configuration and key generation for Hydra DevNet.
 *
 * Handles dynamic generation of cryptographic keys (Cardano payment keys,
 * Hydra signing keys) via Docker containers, construction of funded genesis
 * configs, and publishing of Hydra protocol scripts to L1.
 *
 * ## Key Generation Flow
 *
 * Keys are generated at cluster creation time using the Docker images themselves:
 *
 * 1. **Payment keys** — `cardano-cli address key-gen` produces `payment.skey` / `payment.vkey`
 * 2. **Key hash** — `cardano-cli address key-hash` derives the 28-byte blake2b-224 hash
 * 3. **Hydra keys** — `hydra-node gen-hydra-key` produces `hydra.sk` / `hydra.vk`
 * 4. **Address** — Enterprise testnet address = `0x60` + key_hash
 * 5. **Genesis** — The address is funded in `initialFunds` with 900B lovelace
 *
 * This avoids any dependency on crypto libraries — the Docker images provide
 * all the tooling needed.
 *
 * ## API Design
 *
 * This module uses a **module-function pattern**:
 *
 * ```typescript
 * // Promise user
 * const keys = await Genesis.generateKeys(tempDir, config);
 * await Genesis.writeConfigFiles(tempDir, keys, config);
 * const txId = await Genesis.publishHydraScripts(tempDir, config);
 *
 * // Effect user
 * const keys = yield* Genesis.effect.generateKeys(tempDir, config);
 * yield* Genesis.effect.writeConfigFiles(tempDir, keys, config);
 * const txId = yield* Genesis.effect.publishHydraScripts(tempDir, config);
 * ```
 *
 * @since 0.1.0
 * @module
 */

import { Data, Effect } from 'effect';
import { chmod, mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

import type { ResolvedDevNetConfig, ShelleyGenesis } from './Config.js';
import {
  buildByronGenesis,
  buildShelleyGenesis,
  DEFAULT_ALONZO_GENESIS,
  DEFAULT_CONWAY_GENESIS,
  DEFAULT_HYDRA_SK,
  DEFAULT_HYDRA_VK,
  DEFAULT_INITIAL_FUNDS_LOVELACE,
  DEFAULT_KES_KEY,
  DEFAULT_NODE_JSON_CONFIG,
  DEFAULT_OPCERT,
  DEFAULT_PAYMENT_ADDRESS_HEX,
  DEFAULT_PAYMENT_KEY_HASH,
  DEFAULT_PAYMENT_SKEY,
  DEFAULT_PAYMENT_VKEY,
  DEFAULT_VRF_SKEY,
} from './Config.js';
import * as Container from './Container.js';

// =============================================================================
// Errors
// =============================================================================

/**
 * Error thrown when genesis configuration or key generation fails.
 *
 * @since 0.1.0
 * @category errors
 */
export class GenesisError extends Data.TaggedError('GenesisError')<{
  readonly reason: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

// =============================================================================
// Types
// =============================================================================

/**
 * Result of key generation. Contains paths and derived values
 * needed to configure containers and build genesis.
 *
 * @since 0.1.0
 * @category model
 */
export interface GeneratedKeys {
  /** Path to the cardano payment signing key (payment.skey) */
  readonly paymentSkeyPath: string;
  /** Path to the cardano payment verification key (payment.vkey) */
  readonly paymentVkeyPath: string;
  /** 28-byte hex key hash (blake2b-224 of the verification key) */
  readonly paymentKeyHash: string;
  /** Full hex-encoded enterprise testnet address (60 + key_hash) */
  readonly paymentAddressHex: string;
  /** Path to the hydra signing key (hydra.sk) */
  readonly hydraSkPath: string;
  /** Path to the hydra verification key (hydra.vk) */
  readonly hydraVkPath: string;
}

/**
 * Default topology configuration for the devnet (no peers).
 * @internal
 */
const DEFAULT_TOPOLOGY = {
  Producers: [],
};

// =============================================================================
// Internal Effect Implementations
// =============================================================================

/**
 * Strip Docker log framing bytes from container output.
 *
 * Docker multiplexed streams prepend an 8-byte header to each frame:
 *   bytes 0-3: stream type (01 = stdout, 02 = stderr)
 *   bytes 4-7: payload length (big-endian uint32)
 *
 * When the output comes back as raw bytes (via `container.logs()`), these
 * headers appear as non-printable characters. This function removes them
 * to extract clean text output.
 *
 * @internal
 */
function stripDockerFraming(raw: string): string {
  // Remove all non-printable characters except newlines/tabs
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
  return cleaned.trim();
}

/**
 * Write pre-generated keys to the temp directory.
 *
 * Uses static pre-generated keys (same approach as evolution-sdk).
 * The keys are embedded as constants in Config.ts and written to disk
 * so that Docker containers can mount and use them.
 *
 * @internal
 */
function generateKeysEffect(
  tempDir: string,
  _config: ResolvedDevNetConfig,
): Effect.Effect<GeneratedKeys, GenesisError> {
  return Effect.gen(function* () {
    yield* Effect.tryPromise({
      try: async () => {
        await mkdir(tempDir, { recursive: true });
        await Promise.all([
          writeFile(
            join(tempDir, 'payment.skey'),
            JSON.stringify(DEFAULT_PAYMENT_SKEY, null, 2),
          ),
          writeFile(
            join(tempDir, 'payment.vkey'),
            JSON.stringify(DEFAULT_PAYMENT_VKEY, null, 2),
          ),
          writeFile(
            join(tempDir, 'hydra.sk'),
            JSON.stringify(DEFAULT_HYDRA_SK, null, 2),
          ),
          writeFile(
            join(tempDir, 'hydra.vk'),
            JSON.stringify(DEFAULT_HYDRA_VK, null, 2),
          ),
        ]);
      },
      catch: (cause) =>
        new GenesisError({
          reason: 'key-write',
          message: 'Failed to write pre-generated key files to temp directory',
          cause,
        }),
    });

    return {
      paymentSkeyPath: join(tempDir, 'payment.skey'),
      paymentVkeyPath: join(tempDir, 'payment.vkey'),
      paymentKeyHash: DEFAULT_PAYMENT_KEY_HASH,
      paymentAddressHex: DEFAULT_PAYMENT_ADDRESS_HEX,
      hydraSkPath: join(tempDir, 'hydra.sk'),
      hydraVkPath: join(tempDir, 'hydra.vk'),
    };
  });
}

/**
 * Write all configuration files needed by the Cardano node and Hydra node
 * to the temp directory.
 *
 * Files written:
 * - `config.json` — Cardano node configuration
 * - `topology.json` — Peer topology (empty for devnet)
 * - `genesis-byron.json` — Byron genesis
 * - `genesis-shelley.json` — Shelley genesis with funded payment address
 * - `genesis-alonzo.json` — Alonzo genesis (Plutus parameters)
 * - `genesis-conway.json` — Conway genesis (governance parameters)
 * - `kes.skey` — KES signing key for block production
 * - `vrf.skey` — VRF signing key for block production
 * - `pool.cert` — Operational certificate for block production
 *
 * @internal
 */
function writeConfigFilesEffect(
  tempDir: string,
  keys: GeneratedKeys,
  config: ResolvedDevNetConfig,
  shelleyOverrides: Partial<ShelleyGenesis> = {},
): Effect.Effect<void, GenesisError> {
  return Effect.gen(function* () {
    yield* Effect.tryPromise({
      try: async () => {
        await mkdir(tempDir, { recursive: true });

        // Build genesis configs
        const shelleyGenesis = buildShelleyGenesis(
          keys.paymentAddressHex,
          DEFAULT_INITIAL_FUNDS_LOVELACE,
          {
            ...shelleyOverrides,
            networkMagic: config.cardanoNode.networkMagic,
          },
        );
        const byronGenesis = buildByronGenesis();

        // Write all config files in parallel
        await Promise.all([
          writeFile(
            join(tempDir, 'config.json'),
            JSON.stringify(DEFAULT_NODE_JSON_CONFIG, null, 2),
          ),
          writeFile(
            join(tempDir, 'topology.json'),
            JSON.stringify(DEFAULT_TOPOLOGY, null, 2),
          ),
          writeFile(
            join(tempDir, 'genesis-byron.json'),
            JSON.stringify(byronGenesis, null, 2),
          ),
          writeFile(
            join(tempDir, 'genesis-shelley.json'),
            JSON.stringify(shelleyGenesis, null, 2),
          ),
          writeFile(
            join(tempDir, 'genesis-alonzo.json'),
            JSON.stringify(DEFAULT_ALONZO_GENESIS, null, 2),
          ),
          writeFile(
            join(tempDir, 'genesis-conway.json'),
            JSON.stringify(DEFAULT_CONWAY_GENESIS, null, 2),
          ),
          writeFile(
            join(tempDir, 'kes.skey'),
            JSON.stringify(DEFAULT_KES_KEY, null, 2),
          ).then(() => chmod(join(tempDir, 'kes.skey'), 0o600)),
          writeFile(
            join(tempDir, 'vrf.skey'),
            JSON.stringify(DEFAULT_VRF_SKEY, null, 2),
          ).then(() => chmod(join(tempDir, 'vrf.skey'), 0o600)),
          writeFile(
            join(tempDir, 'pool.cert'),
            JSON.stringify(DEFAULT_OPCERT, null, 2),
          ).then(() => chmod(join(tempDir, 'pool.cert'), 0o600)),
        ]);
      },
      catch: (cause: unknown) =>
        new GenesisError({
          reason: 'config-write',
          message: 'Failed to write configuration files',
          cause,
        }),
    });
  });
}

/**
 * Publish Hydra protocol scripts to L1 and return comma-separated transaction IDs.
 *
 * Runs a one-off container with the hydra-node image:
 * ```
 * hydra-node publish-scripts \
 *   --testnet-magic <magic> \
 *   --node-socket /ipc/node.socket \
 *   --cardano-signing-key /config/payment.skey
 * ```
 *
 * The `publish-scripts` command publishes 3 scripts (initial, commit, head)
 * in separate transactions and outputs their TxIDs as comma-separated hex.
 *
 * The cardano-node must be running and producing blocks before calling this.
 *
 * @internal
 */
function publishHydraScriptsEffect(
  tempDir: string,
  config: ResolvedDevNetConfig,
): Effect.Effect<string, GenesisError> {
  return Effect.gen(function* () {
    const volumeName = `${config.clusterName}-ipc`;
    const networkName = `${config.clusterName}-network`;

    const output = yield* Effect.mapError(
      Container.effect.runOnce(
        config.hydraNode.image,
        [
          'publish-scripts',
          '--testnet-magic',
          String(config.cardanoNode.networkMagic),
          '--node-socket',
          '/ipc/node.socket',
          '--cardano-signing-key',
          '/config/payment.skey',
        ],
        [`${volumeName}:/ipc`, `${tempDir}:/config:ro`],
        networkName,
      ),
      (cause) =>
        new GenesisError({
          reason: 'script-publish',
          message: 'Failed to publish Hydra scripts to L1',
          cause,
        }),
    );

    // The publish-scripts command outputs comma-separated TxIDs
    // (one per script: initial, commit, head validators)
    const txIds = extractTxIds(output);

    if (txIds.length === 0) {
      return yield* Effect.fail(
        new GenesisError({
          reason: 'script-publish',
          message: `Could not extract transaction IDs from output: "${output}"`,
        }),
      );
    }

    return txIds.join(',');
  });
}

/**
 * Extract transaction IDs from the hydra-node publish-scripts output.
 *
 * The `publish-scripts` command publishes 3 scripts (initial, commit, head)
 * in separate transactions and outputs their TxIDs as comma-separated hex:
 * `txid1,txid2,txid3`
 *
 * @internal
 */
function extractTxIds(output: string): Array<string> {
  const cleaned = stripDockerFraming(output);

  // Find all 64-char hex strings (Cardano tx IDs are 32 bytes = 64 hex chars)
  const hexMatches = cleaned.match(/\b[0-9a-fA-F]{64}\b/g);
  if (hexMatches && hexMatches.length > 0) {
    return hexMatches;
  }

  return [];
}

// =============================================================================
// Promise API (Default)
// =============================================================================

/**
 * Generate all cryptographic keys needed for the devnet.
 * Creates Cardano payment keys and Hydra signing keys using Docker containers.
 *
 * @param tempDir - Directory to write key files to
 * @param config - Resolved devnet configuration
 * @returns Generated key paths and derived values
 *
 * @throws {GenesisError} When key generation fails
 *
 * @since 0.1.0
 * @category keys
 */
export async function generateKeys(
  tempDir: string,
  config: ResolvedDevNetConfig,
): Promise<GeneratedKeys> {
  return Effect.runPromise(generateKeysEffect(tempDir, config));
}

/**
 * Write all configuration files for the Cardano and Hydra nodes.
 *
 * @param tempDir - Directory to write config files to
 * @param keys - Previously generated keys
 * @param config - Resolved devnet configuration
 * @param shelleyOverrides - Optional Shelley genesis overrides
 *
 * @throws {GenesisError} When file writing fails
 *
 * @since 0.1.0
 * @category config
 */
export async function writeConfigFiles(
  tempDir: string,
  keys: GeneratedKeys,
  config: ResolvedDevNetConfig,
  shelleyOverrides: Partial<ShelleyGenesis> = {},
): Promise<void> {
  return Effect.runPromise(
    writeConfigFilesEffect(tempDir, keys, config, shelleyOverrides),
  );
}

/**
 * Publish Hydra protocol scripts to L1 and return comma-separated transaction IDs.
 * The Cardano node must be running and producing blocks.
 *
 * @param tempDir - Temp directory with key files
 * @param config - Resolved devnet configuration
 * @returns Comma-separated transaction IDs of the published scripts
 *
 * @throws {GenesisError} When script publishing fails
 *
 * @since 0.1.0
 * @category scripts
 */
export async function publishHydraScripts(
  tempDir: string,
  config: ResolvedDevNetConfig,
): Promise<string> {
  return Effect.runPromise(publishHydraScriptsEffect(tempDir, config));
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
  generateKeys: generateKeysEffect,
  writeConfigFiles: writeConfigFilesEffect,
  publishHydraScripts: publishHydraScriptsEffect,
} as const;
