import type { ScenarioRunner } from "./types";

export const runVID6_4: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  console.log("Loading Customer Loyalty Ledger & Adjustments scenario...");
  await page.goto(`${baseUrl}/dashboard/customers`);
  await page.waitForSelector('h1:has-text("Customers")', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Scene 1: Welcome & Loyalty Ledger Overview
  await playScene(0, async () => {
    await spotlight("table, h1");
    await showKeyBadge("LOYALTY LEDGER", "Track Lifetime Points · Audit Redemptions · Goodwill Adjustments");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Open Customer Loyalty Profile & View Balance Cards
  await playScene(1, async () => {
    const custLink = page.locator("table tbody tr a").first();
    if (await custLink.isVisible()) {
      await custLink.click();
      await page.waitForSelector(".card, h1, h2, h3", { timeout: 10000 });
      await page.waitForTimeout(600);
    }

    await spotlight(".grid.grid-cols-1.sm\\:grid-cols-3, .card:first-child");
    await showKeyBadge("REWARD BALANCE", "Active Reward Points · Rupee Purchasing Value · Lifetime Accrual");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Examine Transaction Audit History
  await playScene(2, async () => {
    await spotlight("table, .card:has(table)");
    await showKeyBadge("TRANSACTION HISTORY", "Bill-by-Bill Point Accruals · POS Counter Redemptions · Timestamps");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Open Adjust Points Modal & Specify Reason
  await playScene(3, async () => {
    const adjustBtn = page.locator('button:has-text("Adjust Points"), button:has-text("Adjust")').first();
    if (await adjustBtn.isVisible()) {
      await spotlight('button:has-text("Adjust Points"), button:has-text("Adjust")');
      await page.waitForTimeout(600);
      await adjustBtn.click();
      await page.waitForTimeout(600);
    }

    const pointsInput = page.locator(".fixed input[type='number']").first();
    if (await pointsInput.isVisible()) {
      await pointsInput.fill("50");
    }

    const reasonInput = page.locator(".fixed input[type='text'], .fixed textarea").first();
    if (await reasonInput.isVisible()) {
      await reasonInput.fill("Complimentary points / Customer delight");
    }

    await spotlight(".fixed.inset-0, .bg-surface");
    await showKeyBadge("MANUAL ADJUSTMENT", "Credit Goodwill Points · Mandatory Audit Reason Coding");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Save Adjustment & Immediate Balance Update
  await playScene(4, async () => {
    const saveAdjustBtn = page.locator('button[type="submit"]:has-text("Apply Adjustment")').first();
    if (await saveAdjustBtn.isVisible()) {
      await saveAdjustBtn.click();
      await page.waitForTimeout(800);
    }

    await spotlight(".grid.grid-cols-1.sm\\:grid-cols-3, table");
    await showKeyBadge("AUDIT LOG COMMITTED", "Points Added to Customer Balance · Traceable Audit Entry");
    await page.waitForTimeout(2400);

    await clearSpotlight();
    await clearKeyBadge();
  });
};
