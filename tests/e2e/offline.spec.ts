import { test, expect } from "@playwright/test";
import {
  setupTestDevice, setupConflictBatch, depleteBatchStock, closeDbPool,
  reserveFreshTestBlock, type TestDeviceSetup,
} from "./helpers/offline-fixture";
import type { ReserveNumbersResponse } from "../../src/server/domain/sync/types";
import {
  initDexieDevice, primeDexieSync, triggerDexieSync, getDexiePendingSales,
  getDexieProvisionalAllocations, computePayloadHash, validateAllowlistExport,
} from "./helpers/offline-db";
import { assertServerSaleDetails, assertServerConflictCase } from "./helpers/offline-server-assertions";
import { formatDeviceInvoiceNo } from "../../src/server/domain/sync/numbers";

let fixture: TestDeviceSetup;
let currentReservation: ReserveNumbersResponse;

test.beforeAll(async () => {
  fixture = await setupTestDevice({ deviceCode: "01" });
});

test.afterAll(async () => {
  await closeDbPool();
});

test.describe("Offline POS Counter E2E Smoke & Integration Suite (Task A4.8)", () => {
  test.beforeEach(async ({ page }) => {
    // 1. Authenticate as seeded admin user
    await page.goto("/login");
    await page.fill('input[name="email"]', "admin@apollo.com");
    await page.fill('input[name="password"]', "admin123");
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL("**/dashboard**", { timeout: 15000 });

    // 2. Navigate to POS Counter
    await page.goto("/dashboard/sales/pos");
    await expect(page.getByPlaceholder(/search medicine/i)).toBeVisible({ timeout: 10000 });

    // 3. Reserve clean number sequence block & initialize Dexie with test credentials
    currentReservation = await reserveFreshTestBlock(fixture, 50);
    await initDexieDevice(page, {
      tenantId: fixture.tenant.id, storeId: fixture.store.id, deviceId: fixture.device.id,
      deviceCode: fixture.device.code, storeCode: fixture.store.code,
      deviceToken: fixture.rawToken, cashierId: fixture.adminUser.id,
    }, currentReservation);
    await primeDexieSync(page);
  });

  test("A: completes 3 offline sales (Cash, UPI, Split) under Rule 46(b) sequencing, reconnects, and synchronizes to server ledger", async ({
    page,
  }) => {
    // 1. Confirm initial online state
    await expect(page.getByRole("button", { name: /online/i })).toBeVisible({ timeout: 5000 });

    // 2. Sever network connectivity
    await page.context().setOffline(true);
    const offlineChip = page.getByRole("button", { name: /offline/i });
    await expect(offlineChip).toBeVisible({ timeout: 5000 });

    const searchInput = page.getByPlaceholder(/search medicine/i);
    const expectedFy = currentReservation.fiscalYear;
    const storeCode = fixture.store.code;
    const deviceCode = fixture.device.code;
    const startSeq = currentReservation.startSeq;

    // --- Sale 1: Cash payment ---
    await searchInput.fill("Paracetamol");
    const addPara1 = page.locator("tr", { hasText: "Paracetamol 500mg" }).getByRole("button", { name: "+ Add" });
    await expect(addPara1).toBeVisible({ timeout: 5000 });
    await addPara1.click();
    await expect(page.locator("table.data-table tr", { hasText: "Paracetamol 500mg" })).toBeVisible({ timeout: 5000 });
    await page.keyboard.press("F10");

    // Verify Offline Receipt Modal & Rule 46(b) Invoice No
    const receiptModal = page.getByRole("heading", { name: /offline sale recorded/i });
    await expect(receiptModal).toBeVisible({ timeout: 5000 });
    const expectedInv1 = formatDeviceInvoiceNo({ storeCode, deviceCode, fiscalYear: expectedFy, sequence: startSeq });
    await expect(page.locator("body")).toContainText(expectedInv1);
    await page.getByTitle("Close").click();
    await expect(receiptModal).not.toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: /1 pending/i })).toBeVisible();

    // --- Sale 2: UPI payment ---
    await searchInput.fill("Dolo");
    const addDolo = page.locator("tr", { hasText: "Dolo 650" }).getByRole("button", { name: "+ Add" });
    await expect(addDolo).toBeVisible({ timeout: 5000 });
    await addDolo.click();
    await expect(page.locator("table.data-table tr", { hasText: "Dolo 650" })).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: /split tender/i }).click();
    await page.getByLabel("UPI tender amount").fill("31.00");
    await page.getByRole("button", { name: /complete sale/i }).click();

    await expect(receiptModal).toBeVisible({ timeout: 5000 });
    const expectedInv2 = formatDeviceInvoiceNo({ storeCode, deviceCode, fiscalYear: expectedFy, sequence: startSeq + 1 });
    await expect(page.locator("body")).toContainText(expectedInv2);
    await page.getByTitle("Close").click();
    await expect(receiptModal).not.toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: /2 pending/i })).toBeVisible();

    // --- Sale 3: Split Tender ---
    await searchInput.fill("Paracetamol");
    const addPara3 = page.locator("tr", { hasText: "Paracetamol 500mg" }).getByRole("button", { name: "+ Add" });
    await expect(addPara3).toBeVisible({ timeout: 5000 });
    await addPara3.click();
    await expect(page.locator("table.data-table tr", { hasText: "Paracetamol 500mg" })).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: /split tender/i }).click();
    await page.getByLabel("Cash tender amount").fill("5.00");
    await page.getByLabel("UPI tender amount").fill("10.00");
    await page.getByRole("button", { name: /complete sale/i }).click();

    await expect(receiptModal).toBeVisible({ timeout: 5000 });
    const expectedInv3 = formatDeviceInvoiceNo({ storeCode, deviceCode, fiscalYear: expectedFy, sequence: startSeq + 2 });
    await expect(page.locator("body")).toContainText(expectedInv3);
    await page.getByTitle("Close").click();
    await expect(receiptModal).not.toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: /3 pending/i })).toBeVisible();

    // 3. Restore network connectivity & await sync completion
    await page.context().setOffline(false);
    await triggerDexieSync(page);
    await expect.poll(async () => {
      await triggerDexieSync(page);
      const pending = await getDexiePendingSales(page);
      return pending.filter((s) => s.status === "pending" || s.status === "syncing").length;
    }, { timeout: 20000, intervals: [1000, 2000] }).toBe(0);

    // 4. PostgreSQL Authoritative Business Truth Verifications
    await assertServerSaleDetails({ invoiceNo: expectedInv1, expectedPaymentMethods: ["cash"] });
    await assertServerSaleDetails({ invoiceNo: expectedInv2, expectedPaymentMethods: ["upi"] });
    await assertServerSaleDetails({ invoiceNo: expectedInv3, expectedPaymentMethods: ["cash", "upi"] });

    // 5. Verify Dexie provisional allocations completely cleared
    const allocs = await getDexieProvisionalAllocations(page);
    expect(allocs).toHaveLength(0);
  });

  test("B: persists offline pending sale with unmutated payload hash across Service Worker reload and synchronizes upon reconnect", async ({
    page,
  }) => {
    // Go offline & complete 1 offline sale
    await page.context().setOffline(true);
    await page.getByPlaceholder(/search medicine/i).fill("Paracetamol");
    await page.getByRole("button", { name: "+ Add" }).first().click();
    await page.keyboard.press("F10");
    await page.getByTitle("Close").click();

    // Capture pending sale & compute pre-reload payload hash
    const [saleBefore] = await getDexiePendingSales(page);
    expect(saleBefore).toBeDefined();
    expect(saleBefore.status).toBe("pending");
    const hashBefore = computePayloadHash(saleBefore.payload);

    // Reload while offline: Service Worker must serve /offline.html
    await page.reload();
    await expect(page.getByRole("heading", { name: /pos counter/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/offline mode active/i)).toBeVisible();

    // Inspect Dexie inside /offline.html: verify same sale survives unmutated
    const [saleAfter] = await getDexiePendingSales(page);
    expect(saleAfter.clientSaleId).toBe(saleBefore.clientSaleId);
    expect(saleAfter.invoiceNo).toBe(saleBefore.invoiceNo);
    expect(computePayloadHash(saleAfter.payload)).toBe(hashBefore);

    // Reconnect & return to POS
    await page.context().setOffline(false);
    const retryBtn = page.locator("#retryBtn, a:has-text('Retry POS Connection')");
    if (await retryBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await retryBtn.click().catch(() => {});
    }
    if (!page.url().includes("/dashboard/sales/pos")) {
      await page.goto("/dashboard/sales/pos").catch(() => {});
    }
    await expect(page.getByPlaceholder(/search medicine/i)).toBeVisible({ timeout: 15000 });
    await triggerDexieSync(page);

    // Await automatic sync completion
    await expect.poll(async () => {
      await triggerDexieSync(page);
      const sales = await getDexiePendingSales(page);
      return sales.find((s) => s.clientSaleId === saleBefore.clientSaleId)?.status;
    }, { timeout: 20000, intervals: [1000, 2000] }).toBe("synced");

    await assertServerSaleDetails({ invoiceNo: saleBefore.invoiceNo });
  });

  test("C: enforces offline capability restrictions and exports disaster recovery JSON adhering strictly to allowlist schema", async ({
    page,
  }) => {
    await page.context().setOffline(true);

    // 1. Verify offline capability restriction: loyalty redemption blocked
    await page.getByPlaceholder(/search medicine/i).fill("Paracetamol");
    await page.getByRole("button", { name: "+ Add" }).first().click();
    await page.getByRole("button", { name: /split tender/i }).click();

    // Try redeeming loyalty points
    const pointsInput = page.getByPlaceholder("Pts");
    if (await pointsInput.isVisible()) {
      await pointsInput.fill("50");
      await page.getByRole("button", { name: /complete sale/i }).click();
      await expect(page.getByText(/loyalty points redemption is disabled while offline/i)).toBeVisible({ timeout: 5000 });
    }
    await page.keyboard.press("Escape");

    // Complete normal sale to populate outbox for export test
    await page.keyboard.press("F10");
    await page.getByTitle("Close").click();

    // 2. Open Pending Bills Drawer & Trigger JSON Export
    await page.getByRole("button", { name: /pending/i }).click();
    await expect(page.getByRole("heading", { name: /pending (offline )?bills/i })).toBeVisible();

    page.on("dialog", (dialog) => dialog.accept());
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /export json/i }).click();
    const download = await downloadPromise;

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const dumpJson = JSON.parse(Buffer.concat(chunks).toString("utf-8"));

    // 3. Strict allowlist validation
    const validation = validateAllowlistExport(dumpJson, [fixture.rawToken]);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);

    // Restore network
    await page.context().setOffline(false);
  });

  test("D: reconciles multi-device stock conflict upon reconnect and logs durable conflict case on server", async ({
    page,
  }) => {
    // 1. Set up conflict batch with exactly 10 units
    const { batch, medicine } = await setupConflictBatch({
      tenantId: fixture.tenant.id,
      storeId: fixture.store.id,
      userId: fixture.adminUser.id,
      initialQty: 10,
    });
    await primeDexieSync(page);

    // 2. Disconnect Context 1 & bill all 10 units offline
    await page.context().setOffline(true);
    await page.getByPlaceholder(/search medicine/i).fill(medicine.name);
    await page.getByRole("button", { name: "+ Add" }).first().click();

    // Ensure packQty is 1 (1 pack = 10 units)
    const packInput = page.locator('input[data-cart-input="pack"]').first();
    await packInput.fill("1");
    await page.keyboard.press("F10");

    const receiptModal = page.getByRole("heading", { name: /offline sale recorded/i });
    await expect(receiptModal).toBeVisible({ timeout: 5000 });
    const pendingSales = await getDexiePendingSales(page);
    const pending = pendingSales.find((s) => s.payload.lines?.some((l) => l.batchId === batch.id)) ?? pendingSales[pendingSales.length - 1];
    const offlineInv = pending.invoiceNo;
    await page.getByTitle("Close").click();

    // 3. Context 2: Server concurrently depletes batch to 0 before Context 1 reconnects
    await depleteBatchStock({
      tenantId: fixture.tenant.id,
      storeId: fixture.store.id,
      batchId: batch.id,
      medicineId: medicine.id,
      userId: fixture.adminUser.id,
    });

    // 4. Reconnect Context 1 & sync under offline_reconciliation policy
    await page.context().setOffline(false);
    await triggerDexieSync(page);
    await expect.poll(async () => {
      const sales = await getDexiePendingSales(page);
      return sales.find((s) => s.invoiceNo === offlineInv)?.status;
    }, { timeout: 20000 }).toBe("synced");

    // 5. Assert durable conflict case and contribution created on PostgreSQL
    const { caseRow } = await assertServerConflictCase({
      storeId: fixture.store.id,
      invoiceNo: offlineInv,
      expectedDeficit: 10,
    });
    expect(caseRow.status).toBe("open");

    // 6. Navigate to Conflict Management UI & verify presence
    await page.goto("/dashboard/inventory/conflicts");
    await expect(page.getByText(medicine.name)).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: /investigate \/ resolve/i }).first().click();
    await expect(page.getByText(offlineInv)).toBeVisible({ timeout: 10000 });
  });
});
