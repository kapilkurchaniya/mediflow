import type { ScenarioRunner } from "./types";

export const runVID4_4: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  console.log("Loading Opening Stock Batches scenario...");
  await page.goto(`${baseUrl}/dashboard/inventory/batches`);
  await page.waitForSelector('h1:has-text("Batches & stock")', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Scene 1: Opening Stock Overview
  await playScene(0, async () => {
    await spotlight('h1:has-text("Batches & stock")');
    await showKeyBadge("OPENING STOCK", "Capture Physical Shelf Goods into Traceable Batches");
    await page.waitForTimeout(2000);

    const openBtn = page.locator('a:has-text("Opening stock")').first();
    if (await openBtn.isVisible()) {
      await spotlight('a:has-text("Opening stock")');
    }
    await page.waitForTimeout(1800);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Open Opening Stock Entry Form
  await playScene(1, async () => {
    await page.goto(`${baseUrl}/dashboard/inventory/batches/new`);
    await page.waitForSelector("select#medicineId", { timeout: 10000 });
    await page.waitForTimeout(500);

    await spotlight("form.card");
    await showKeyBadge("RECORD SHELF INVENTORY", "Onboard Physical Items with Batch & Expiry");
    await page.waitForTimeout(2000);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Select Master Item & Auto-Load Details
  await playScene(2, async () => {
    const medSelect = page.locator("select#medicineId");
    const count = await medSelect.locator("option").count();
    if (count > 1) {
      await medSelect.selectOption({ index: 1 });
    }
    await page.waitForTimeout(600);

    const banner = page.locator(".bg-sky-50");
    if (await banner.isVisible()) {
      await spotlight(".bg-sky-50");
    } else {
      await spotlight("select#medicineId");
    }
    await showKeyBadge("ITEM AUTO-SYNC", "Generic Composition, Pack Size & Default Rates Loaded");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Input Batch Number, Expiry, Qty & Purchase Rate
  await playScene(3, async () => {
    const batchInput = page.locator("input#batchNo");
    await batchInput.fill("BT-2026-X1");
    await page.waitForTimeout(200);

    const expInput = page.locator("input#expiryDate");
    await expInput.fill("2027-12-31");
    await page.waitForTimeout(200);

    const qtyInput = page.locator("input#qty");
    await qtyInput.fill("150");
    await page.waitForTimeout(200);

    const ptrInput = page.locator("input#purchaseRate");
    await ptrInput.fill("165.00");
    await page.waitForTimeout(200);

    await spotlight("input#batchNo, input#expiryDate, input#qty, input#purchaseRate");
    await showKeyBadge("BATCH ATTRIBUTES", "Batch BT-2026-X1 · Exp 12/2027 · Qty: 150 · PTR ₹165");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Save Batch & Live Stock Valuation
  await playScene(4, async () => {
    const submitBtn = page.locator('button[type="submit"]:has-text("Record stock")');
    await spotlight('button[type="submit"]:has-text("Record stock")');
    await showKeyBadge("COMMIT TO INVENTORY", "Update Store Valuation & Enable FEFO Dispensing");
    await page.waitForTimeout(1000);

    await submitBtn.click();
    await page.waitForURL("**/dashboard/inventory/batches**", { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(800);

    const table = page.locator("table");
    if (await table.isVisible()) {
      await spotlight("table tbody tr:first-child");
    } else {
      await spotlight(".page");
    }
    await showKeyBadge("150 UNITS COMMITTED", "Batch Live · Audit Valuation Updated · POS Ready");
    await page.waitForTimeout(2400);

    await clearSpotlight();
    await clearKeyBadge();
  });
};
