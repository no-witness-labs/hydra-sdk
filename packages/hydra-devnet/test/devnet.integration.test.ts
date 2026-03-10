import { Cluster, Container, Images } from "@no-witness-labs/hydra-devnet";
import Docker from "dockerode";
import { afterAll, describe, expect, it } from "vitest";

/**
 * Heavy integration tests (cluster start/stop, container ops) require a running
 * Docker daemon with Cardano + Hydra images and take several minutes.
 */

/**
 * Fast Shelley genesis config for testing.
 * Produces blocks every 20ms instead of default 1s (50x faster).
 * Same configuration used in evolution-sdk integration tests.
 */
const FAST_SHELLEY_GENESIS = {
  activeSlotsCoeff: 1.0, // Block every slot (100% probability)
  epochLength: 50, // Very short epochs for faster testing
  slotLength: 0.02, // 20ms per slot (50x faster than default 1s)
} as const;

/**
 * Integration tests for Hydra DevNet module using REAL Docker containers.
 *
 * Prerequisites:
 * - Docker daemon must be running
 * - Sufficient disk space for Cardano + Hydra images
 *
 * Run with: pnpm test:devnet
 */
describe("Devnet Integration Tests", () => {
  const createdClusters: Array<Cluster.Cluster> = [];

  afterAll(async () => {
    for (const cluster of createdClusters) {
      try {
        await cluster.remove();
      } catch {
        // Silently ignore cleanup errors
      }
    }
  }, 120_000);

  describe("Cluster Creation", () => {
    it(
      "should create devnet cluster with default configuration",
      { timeout: 120_000 },
      async () => {
        const cluster = Cluster.make();
        createdClusters.push(cluster);

        expect(cluster.config).toBeDefined();
        expect(cluster.config.clusterName).toBe("hydra-devnet");
        expect(cluster.config.cardanoNode.image).toBe(
          "ghcr.io/intersectmbo/cardano-node:10.5.3",
        );
        expect(cluster.config.hydraNode.image).toBe(
          "ghcr.io/cardano-scaling/hydra-node:1.2.0",
        );

        // Containers not created until start()
        expect(cluster.cardanoNode).toBeUndefined();
        expect(cluster.hydraNode).toBeUndefined();
      },
    );

    it(
      "should create devnet cluster with custom cluster name",
      { timeout: 120_000 },
      async () => {
        const customName = "test-custom-cluster";
        const cluster = Cluster.make({ clusterName: customName });
        createdClusters.push(cluster);

        expect(cluster.config.clusterName).toBe(customName);
      },
    );

    it(
      "should create cluster with custom ports",
      { timeout: 120_000 },
      async () => {
        const cluster = Cluster.make({
          clusterName: "test-custom-ports",
          cardanoNode: { port: 13001 },
          hydraNode: { apiPort: 14001, peerPort: 15001 },
        });
        createdClusters.push(cluster);

        expect(cluster.config.cardanoNode.port).toBe(13001);
        expect(cluster.config.hydraNode.apiPort).toBe(14001);
        expect(cluster.config.hydraNode.peerPort).toBe(15001);

        expect(cluster.hydraApiUrl).toBe("ws://localhost:14001");
        expect(cluster.hydraHttpUrl).toBe("http://localhost:14001");
      },
    );
  });

  describe("Cluster Lifecycle", () => {
    it(
      "should start cluster and all containers become running",
      { timeout: 300_000 },
      async () => {
        const cluster = Cluster.make({
          clusterName: "test-start-cluster",
          cardanoNode: { port: 23001, submitPort: 28090 },
          hydraNode: { apiPort: 24001, monitoringPort: 26001, peerPort: 25001 },
          shelleyGenesisOverrides: FAST_SHELLEY_GENESIS,
        });
        createdClusters.push(cluster);

        await cluster.start();

        const docker = new Docker();

        expect(cluster.cardanoNode).toBeDefined();
        const cardanoInfo = await docker
          .getContainer(cluster.cardanoNode!.id)
          .inspect();
        expect(cardanoInfo.State.Running).toBe(true);

        expect(cluster.hydraNode).toBeDefined();
        const hydraInfo = await docker
          .getContainer(cluster.hydraNode!.id)
          .inspect();
        expect(hydraInfo.State.Running).toBe(true);

        // Hydra scripts should have been published (comma-separated TxIDs)
        expect(cluster.scriptsTxId).toBeDefined();
        expect(cluster.scriptsTxId).toMatch(/^[a-f0-9]{64}(,[a-f0-9]{64})*$/i);

        await cluster.stop();
      },
    );

    it("should stop running cluster", { timeout: 300_000 }, async () => {
      const cluster = Cluster.make({
        clusterName: "test-stop-cluster",
        cardanoNode: { port: 33001, submitPort: 38090 },
        hydraNode: { apiPort: 34001, monitoringPort: 36001, peerPort: 35001 },
        shelleyGenesisOverrides: FAST_SHELLEY_GENESIS,
      });
      createdClusters.push(cluster);

      await cluster.start();
      await cluster.stop();

      const docker = new Docker();
      const cardanoInfo = await docker
        .getContainer(cluster.cardanoNode!.id)
        .inspect();
      expect(cardanoInfo.State.Running).toBe(false);
    });

    it(
      "should report cluster running status",
      { timeout: 300_000 },
      async () => {
        const cluster = Cluster.make({
          clusterName: "test-running-status",
          cardanoNode: { port: 43001, submitPort: 48090 },
          hydraNode: { apiPort: 44001, monitoringPort: 46001, peerPort: 45001 },
          shelleyGenesisOverrides: FAST_SHELLEY_GENESIS,
        });
        createdClusters.push(cluster);

        expect(await cluster.isRunning()).toBe(false);

        await cluster.start();
        expect(await cluster.isRunning()).toBe(true);

        await cluster.stop();
        expect(await cluster.isRunning()).toBe(false);
      },
    );
  });

  describe("Container Operations", () => {
    it(
      "should get container status after start",
      { timeout: 300_000 },
      async () => {
        const cluster = Cluster.make({
          clusterName: "test-container-status",
          cardanoNode: { port: 53001, submitPort: 58090 },
          hydraNode: { apiPort: 54001, monitoringPort: 56001, peerPort: 55001 },
          shelleyGenesisOverrides: FAST_SHELLEY_GENESIS,
        });
        createdClusters.push(cluster);

        await cluster.start();

        const status = await Container.getStatus(cluster.cardanoNode!);

        expect(status).toBeDefined();
        expect(status?.State).toBeDefined();
        expect(status?.State.Running).toBe(true);

        await cluster.stop();
      },
    );

    it(
      "should check if container is running",
      { timeout: 300_000 },
      async () => {
        const cluster = Cluster.make({
          clusterName: "test-is-running",
          cardanoNode: { port: 63001, submitPort: 60090 },
          hydraNode: { apiPort: 64001, monitoringPort: 64601, peerPort: 64501 },
          shelleyGenesisOverrides: FAST_SHELLEY_GENESIS,
        });
        createdClusters.push(cluster);

        await cluster.start();
        expect(await Container.isRunning(cluster.cardanoNode!)).toBe(true);

        await cluster.stop();
        expect(await Container.isRunning(cluster.cardanoNode!)).toBe(false);
      },
    );
  });

  describe("Image Operations", () => {
    it("should check if image is available", { timeout: 30_000 }, async () => {
      // Check for a common image that likely exists
      const available = await Images.isAvailable("hello-world");
      expect(typeof available).toBe("boolean");
    });

    it(
      "should return false for non-existent image",
      { timeout: 30_000 },
      async () => {
        const available = await Images.isAvailable(
          "nonexistent/image:definitely-does-not-exist-12345",
        );
        expect(available).toBe(false);
      },
    );
  });

  describe("Network Config", () => {
    it(
      "should generate valid network URLs from config",
      { timeout: 120_000 },
      async () => {
        const cluster = Cluster.make({
          clusterName: "test-network-config",
          hydraNode: { apiPort: 74001 },
        });
        createdClusters.push(cluster);

        expect(cluster.hydraApiUrl).toBe("ws://localhost:74001");
        expect(cluster.hydraHttpUrl).toBe("http://localhost:74001");
      },
    );

    it(
      "should use default ports when not specified",
      { timeout: 120_000 },
      async () => {
        const cluster = Cluster.make();
        createdClusters.push(cluster);

        expect(cluster.hydraApiUrl).toBe("ws://localhost:4001");
        expect(cluster.hydraHttpUrl).toBe("http://localhost:4001");
        expect(cluster.config.cardanoNode.port).toBe(3001);
        expect(cluster.config.cardanoNode.networkMagic).toBe(42);
      },
    );
  });
});
