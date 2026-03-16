import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("BROWSER ERROR:", msg.text());
  });
  page.on("pageerror", (err) => console.log("PAGE ERROR:", err.message));

  await page.goto("/");
  // Wait for SDK to load
  await page.waitForFunction(
    () => (window as any).__SDK_READY__ === true,
    null,
    { timeout: 15_000 },
  );
});

// ---------------------------------------------------------------------------
// 1. SDK loads and exports expected modules
// ---------------------------------------------------------------------------

test("SDK loads in browser and exports Head module", async ({ page }) => {
  const hasHead = await page.evaluate(() => {
    const sdk = (window as any).HydraSDK;
    return typeof sdk.Head === "object" && typeof sdk.Head.create === "function";
  });
  expect(hasHead).toBe(true);
});

test("SDK exports Provider module", async ({ page }) => {
  const hasProvider = await page.evaluate(() => {
    const sdk = (window as any).HydraSDK;
    return typeof sdk.Provider === "object";
  });
  expect(hasProvider).toBe(true);
});

test("SDK exports Query module", async ({ page }) => {
  const hasQuery = await page.evaluate(() => {
    const sdk = (window as any).HydraSDK;
    return typeof sdk.Query === "object";
  });
  expect(hasQuery).toBe(true);
});

// ---------------------------------------------------------------------------
// 2. Mock transport lifecycle — same as Node.js HeadApi tests
// ---------------------------------------------------------------------------

test("runs init → close → fanout lifecycle via mock transport", async ({
  page,
}) => {
  const finalState = await page.evaluate(async () => {
    const { Head } = (window as any).HydraSDK;
    const head = await Head.create({ url: "mock://localhost:4001" });
    await head.init();
    await head.commit({});
    await head.close();
    await head.fanout();
    const state = head.getState();
    await head.dispose();
    return state;
  });
  expect(finalState).toBe("Final");
});

test("rejects invalid lifecycle transitions from FSM", async ({ page }) => {
  const errorMessage = await page.evaluate(async () => {
    const { Head } = (window as any).HydraSDK;
    const head = await Head.create({ url: "mock://localhost:4001" });
    try {
      await head.close();
      return null;
    } catch (e: any) {
      return e.message;
    } finally {
      await head.dispose();
    }
  });
  expect(errorMessage).toContain(
    "Command Close is not allowed while head is Idle",
  );
});

// ---------------------------------------------------------------------------
// 3. Head commands — Recover, Decommit, Contest
// ---------------------------------------------------------------------------

test("Recover command works in Open state via mock transport", async ({
  page,
}) => {
  const state = await page.evaluate(async () => {
    const { Head } = (window as any).HydraSDK;
    const head = await Head.create({ url: "mock://localhost:4001" });
    await head.init();
    await head.commit({});
    await head.recover("tx-deposit-abc123");
    const s = head.getState();
    await head.dispose();
    return s;
  });
  expect(state).toBe("Open");
});

test("Recover rejects when head is not Open", async ({ page }) => {
  const errorMessage = await page.evaluate(async () => {
    const { Head } = (window as any).HydraSDK;
    const head = await Head.create({ url: "mock://localhost:4001" });
    try {
      await head.recover("tx-deposit-abc123");
      return null;
    } catch (e: any) {
      return e.message;
    } finally {
      await head.dispose();
    }
  });
  expect(errorMessage).toContain(
    "Command Recover is not allowed while head is Idle",
  );
});

test("Decommit command works in Open state via mock transport", async ({
  page,
}) => {
  const state = await page.evaluate(async () => {
    const { Head } = (window as any).HydraSDK;
    const head = await Head.create({ url: "mock://localhost:4001" });
    await head.init();
    await head.commit({});
    await head.decommit({
      type: "Tx ConwayEra",
      description: "Ledger Cddl Format",
      cborHex: "84a400d9010280018002000300a0f5f6",
      txId: "decommit-tx-id-123",
    });
    const s = head.getState();
    await head.dispose();
    return s;
  });
  expect(state).toBe("Open");
});

test("Contest rejects when head is Idle", async ({ page }) => {
  const errorMessage = await page.evaluate(async () => {
    const { Head } = (window as any).HydraSDK;
    const head = await Head.create({ url: "mock://localhost:4001" });
    try {
      await head.contest();
      return null;
    } catch (e: any) {
      return e.message;
    } finally {
      await head.dispose();
    }
  });
  expect(errorMessage).toContain(
    "Command Contest is not allowed while head is Idle",
  );
});

// ---------------------------------------------------------------------------
// 4. Event subscription works in browser
// ---------------------------------------------------------------------------

test("subscribe() delivers events in browser", async ({ page }) => {
  const tags = await page.evaluate(async () => {
    const { Head } = (window as any).HydraSDK;
    const head = await Head.create({ url: "mock://localhost:4001" });
    const events: string[] = [];
    const unsub = head.subscribe((event: any) => {
      events.push(event.tag);
    });
    await head.init();
    unsub();
    await head.dispose();
    return events;
  });
  expect(tags).toContain("HeadIsInitializing");
});

// ---------------------------------------------------------------------------
// 5. Head.create resolves with correct initial state
// ---------------------------------------------------------------------------

test("Head.create resolves with Idle state after mock Greetings", async ({
  page,
}) => {
  const state = await page.evaluate(async () => {
    const { Head } = (window as any).HydraSDK;
    const head = await Head.create({ url: "mock://localhost:4001" });
    const s = head.getState();
    await head.dispose();
    return s;
  });
  expect(state).toBe("Idle");
});
