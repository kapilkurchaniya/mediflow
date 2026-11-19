import type { ScenarioRunner } from "./types";

export const runVID4_2: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  console.log("Loading Packaging Units & Conversion Ratio scenario...");
  await page.goto(`${baseUrl}/dashboard/inventory`);
  await page.waitForSelector('h1:has-text("Item master")', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Scene 1: Retail Packaging Dilemma Overview
  await playScene(0, async () => {
    await spotlight('h1:has-text("Item master")');
    await showKeyBadge("PACKAGING UNITS", "Whole Blister Strips vs Partial Loose Tablets");
    await page.waitForTimeout(2000);

    const table = page.locator("table");
    if (await table.isVisible()) {
      await spotlight("table");
    }
    await page.waitForTimeout(1800);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Medicine Master Conversion Ratio Setup
  await playScene(1, async () => {
    await page.goto(`${baseUrl}/dashboard/inventory/new`);
    await page.waitForSelector("select#unit", { timeout: 10000 });
    await page.waitForTimeout(500);

    const unitSelect = page.locator("select#unit");
    await unitSelect.selectOption("strip");
    await page.waitForTimeout(300);

    const packInput = page.locator("input#packSize");
    await packInput.fill("10 tablets per strip");
    await page.waitForTimeout(400);

    await spotlight("select#unit, input#packSize");
    await showKeyBadge("CONVERSION RATIO", "1 Strip = 10 Tablets · Mathematical Unit Factor");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Counter Reality - Adding Strip to POS Cart
  await playScene(2, async () => {
    await page.goto(`${baseUrl}/dashboard/sales/pos`);
    const searchInput = page.locator('input[placeholder*="Search medicine"]');
    await searchInput.waitFor({ state: "visible", timeout: 10000 });
    await page.waitForTimeout(600);

    // Search for Amoxicillin / available medicine
    await searchInput.fill("Amoxicillin");
    await page.waitForTimeout(600);

    const itemRow = page.locator(".dropdown-menu li, .card div:has-text('Amoxicillin')").first();
    if (await itemRow.isVisible()) {
      await itemRow.click();
    } else {
      await searchInput.press("ArrowDown");
      await searchInput.press("Enter");
    }
    await page.waitForTimeout(800);

    // Spotlight cart table
    const cartTable = page.locator("table.data-table");
    if (await cartTable.isVisible()) {
      await spotlight("table.data-table");
    }
    await showKeyBadge("POS COUNTER BILLING", "Strip Added to Active Cart · Ready for Loose Dispense");
    await page.waitForTimeout(2000);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Entering Loose Tablets & Automated Proportional Pricing
  await playScene(3, async () => {
    // Fill loose quantity input (placeholder="0")
    const looseInput = page.locator('input[placeholder="0"]').first();
    const packInput = page.locator("input.font-mono.w-20").first();

    if (await packInput.isVisible()) {
      await packInput.fill("0");
      await page.waitForTimeout(200);
    }

    if (await looseInput.isVisible()) {
      await looseInput.fill("4");
      await page.waitForTimeout(400);
      await spotlight('input[placeholder="0"]');
    }

    await showKeyBadge("FRACTIONAL PRICING", "4 Loose Tablets · 40% of Strip Rate Automatically Computed");
    await page.waitForTimeout(2400);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Exact Decimal Stock Depletion & Audit Harmony
  await playScene(4, async () => {
    const totalsBar = page.locator('.card:has-text("Total Payable")');
    if (await totalsBar.isVisible()) {
      await spotlight('.card:has-text("Total Payable")');
    }
    await showKeyBadge("ZERO AUDIT MISMATCH", "0.4 Strips Deducted · Exact Warehouse & Cash Reconciliation");
    await page.waitForTimeout(2400);

    await clearSpotlight();
    await clearKeyBadge();
  });
};
