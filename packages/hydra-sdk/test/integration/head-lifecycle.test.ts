import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { Cluster, Container } from "@no-witness-labs/hydra-devnet";
import { Head } from "@no-witness-labs/hydra-sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Fast Shelley genesis config for testing.
 * Produces blocks every 20ms instead of default 1s (50x faster).
 */
const FAST_SHELLEY_GENESIS = {
  activeSlotsCoeff: 1.0,
  epochLength: 50,
  slotLength: 0.02,
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function commitEmpty(cluster: Cluster.Cluster): Promise<void> {
  const response = await fetch(`${cluster.hydraHttpUrl}/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!response.ok) {
    throw new Error(
      `Commit draft failed: ${response.status} ${await response.text()}`,
    );
  }
  const draftTx = await response.text();

  await writeFile(join(cluster.tempDir!, "commit-draft.json"), draftTx);

  await Container.exec(cluster.cardanoNode!, [
    "sh",
    "-c",
    "cardano-cli conway transaction sign" +
      " --tx-file /opt/cardano/config/commit-draft.json" +
      " --signing-key-file /opt/cardano/config/payment.skey" +
      " --out-file /tmp/commit-signed.json",
  ]);

  await Container.exec(cluster.cardanoNode!, [
    "sh",
    "-c",
    "cardano-cli conway transaction submit" +
      " --tx-file /tmp/commit-signed.json" +
      " --socket-path /opt/cardano/ipc/node.socket" +
      ` --testnet-magic ${cluster.config.cardanoNode.networkMagic}`,
  ]);
}

function makeCluster(
  name: string,
  ports: { node: number; submit: number; api: number; peer: number; mon: number },
): Cluster.Cluster {
  return Cluster.make({
    clusterName: name,
    cardanoNode: { port: ports.node, submitPort: ports.submit },
    hydraNode: {
      apiPort: ports.api,
      peerPort: ports.peer,
      monitoringPort: ports.mon,
      contestationPeriod: 3,
    },
    shelleyGenesisOverrides: FAST_SHELLEY_GENESIS,
  });
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe("Hydra SDK — Head Lifecycle Integration", () => {
  let cluster: Cluster.Cluster;

  beforeAll(async () => {
    cluster = makeCluster("hydra-sdk-lifecycle", {
      node: 9002,
      submit: 9091,
      api: 9402,
      peer: 9502,
      mon: 9602,
    });
    await cluster.start();
  }, 300_000);

  afterAll(async () => {
    try {
      await cluster?.remove();
    } catch {
      // Best-effort cleanup
    }
  }, 120_000);

  // -------------------------------------------------------------------------
  // 1. Full lifecycle: connect → init → commit → open → close → fanout
  // -------------------------------------------------------------------------
  it(
    "full lifecycle: init → commit → open → close → fanout",
    async () => {
      const head = await Head.create({ url: cluster.hydraApiUrl });

      try {
        expect(head.getState()).toBe("Idle");

        await head.init();
        expect(head.getState()).toBe("Initializing");

        const events = head.subscribeEvents();
        await commitEmpty(cluster);

        for await (const event of events) {
          if (event.tag === "HeadIsOpen") break;
        }
        expect(head.getState()).toBe("Open");

        await head.close();
        expect(head.getState()).toBe("Closed");

        await head.fanout();
        expect(head.getState()).toBe("Final");
      } finally {
        await head.dispose();
      }
    },
    600_000,
  );
});

describe("Hydra SDK — Abort Path", () => {
  let cluster: Cluster.Cluster;

  beforeAll(async () => {
    cluster = makeCluster("hydra-sdk-abort", {
      node: 9003,
      submit: 9092,
      api: 9403,
      peer: 9503,
      mon: 9603,
    });
    await cluster.start();
  }, 300_000);

  afterAll(async () => {
    try {
      await cluster?.remove();
    } catch {
      // Best-effort cleanup
    }
  }, 120_000);

  // -------------------------------------------------------------------------
  // 2. Abort path: init → abort
  // -------------------------------------------------------------------------
  it(
    "init → abort transitions to Aborted",
    async () => {
      const head = await Head.create({ url: cluster.hydraApiUrl });

      try {
        expect(head.getState()).toBe("Idle");

        await head.init();
        expect(head.getState()).toBe("Initializing");

        await head.abort();
        expect(head.getState()).toBe("Aborted");
      } finally {
        await head.dispose();
      }
    },
    600_000,
  );
});

describe("Hydra SDK — Event Subscription", () => {
  let cluster: Cluster.Cluster;

  beforeAll(async () => {
    cluster = makeCluster("hydra-sdk-events", {
      node: 9004,
      submit: 9093,
      api: 9404,
      peer: 9504,
      mon: 9604,
    });
    await cluster.start();
  }, 300_000);

  afterAll(async () => {
    try {
      await cluster?.remove();
    } catch {
      // Best-effort cleanup
    }
  }, 120_000);

  // -------------------------------------------------------------------------
  // 3. Event subscription: verify callback subscription delivers events
  // -------------------------------------------------------------------------
  it(
    "subscribe() delivers lifecycle events via callback",
    async () => {
      const head = await Head.create({ url: cluster.hydraApiUrl });
      const collectedTags: Array<string> = [];

      try {
        const unsub = head.subscribe((event) => {
          collectedTags.push(event.tag);
        });

        await head.init();

        // Allow events to propagate
        await new Promise((r) => setTimeout(r, 2_000));
        unsub();

        expect(collectedTags).toContain("HeadIsInitializing");
      } finally {
        await head.dispose();
      }
    },
    600_000,
  );
});

describe("Hydra SDK — Reconnection", () => {
  let cluster: Cluster.Cluster;

  beforeAll(async () => {
    cluster = makeCluster("hydra-sdk-reconnect", {
      node: 9005,
      submit: 9094,
      api: 9405,
      peer: 9505,
      mon: 9605,
    });
    await cluster.start();
  }, 300_000);

  afterAll(async () => {
    try {
      await cluster?.remove();
    } catch {
      // Best-effort cleanup
    }
  }, 120_000);

  // -------------------------------------------------------------------------
  // 4. Reconnection: disconnect and reconnect preserves state
  // -------------------------------------------------------------------------
  it(
    "reconnects after hydra-node restart and preserves state",
    async () => {
      const head = await Head.create({
        url: cluster.hydraApiUrl,
        reconnect: {
          maxRetries: 10,
          initialDelayMs: 200,
          maxDelayMs: 5_000,
        },
      });

      try {
        expect(head.getState()).toBe("Idle");

        await head.init();
        expect(head.getState()).toBe("Initializing");

        // Restart hydra-node to force disconnect
        await Container.stop(cluster.hydraNode!);
        await Container.start(cluster.hydraNode!);

        // Wait for reconnection + Greetings with restored state
        await new Promise((r) => setTimeout(r, 15_000));

        // After reconnect, hydra-node sends Greetings with persisted state
        expect(head.getState()).toBe("Initializing");
      } finally {
        await head.dispose();
      }
    },
    600_000,
  );
});
