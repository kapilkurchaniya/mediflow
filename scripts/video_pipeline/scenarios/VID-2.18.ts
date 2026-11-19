import type { ScenarioRunner } from "./types";

export const runVID2_18: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  console.log("Loading POS Counter for Loyalty Redemption scenario...");
  await page.goto(`${baseUrl}/dashboard/sales/pos`);
  await page.waitForSelector('input[placeholder*="Search medicine"], input[placeholder*="Scan barcode"]', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Scene 1: Welcome & Overview of POS Loyalty Points
  await playScene(0, async () => {
    await spotlight(".pos-header, header, .flex.items-center.justify-between.gap-3");
    await showKeyBadge("POS LOYALTY REDEMPTION", "Reward Returning Patients · Instant Rupee Discounts at Checkout");
    await page.waitForTimeout(2200);

    // Spotlight medicine search bar
    await spotlight('input[placeholder*="Search medicine"], input[placeholder*="Scan barcode"]');
    await page.waitForTimeout(2000);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Customer Selection & Live Points Balance Indicator
  await playScene(1, async () => {
    // Focus customer search input
    const custSearch = page.locator('input[placeholder*="Search customer"]');
    await spotlight('input[placeholder*="Search customer"]');
    await showKeyBadge("CUSTOMER PICKER", "Search Registered Patients by Mobile or Name");
    await page.waitForTimeout(1000);

    await custSearch.click();
    await custSearch.fill("Ramesh");
    await page.waitForTimeout(800);

    // Select Ramesh Kumar from dropdown
    const customerOption = page.locator('button:has-text("Ramesh Kumar")').first();
    if (await customerOption.isVisible()) {
      await customerOption.click();
      await page.waitForTimeout(800);
    }

    // Spotlight the selected customer banner showing loyalty points
    await spotlight(".bg-brand-50\\/60.border.border-brand-200");
    await showKeyBadge("LIVE POINTS BALANCE", "Verified Redeemable Reward Points & Rupee Monetary Value");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Split Tender Panel (F8) & Redeem Max Button
  await playScene(2, async () => {
    // Add Paracetamol to cart
    const searchMed = page.locator('input[placeholder*="Search medicine"], input[placeholder*="Scan barcode"]');
    await searchMed.click();
    await searchMed.fill("Paracetamol");
    await page.waitForTimeout(700);

    const batchRow = page.locator('tr.cursor-pointer').first();
    if (await batchRow.isVisible().catch(() => false)) {
      await batchRow.click();
    } else {
      await page.keyboard.press("Enter");
    }
    await page.waitForTimeout(800);

    // Increase pack qty so bill total exceeds discount
    const packInput = page.locator('input[data-cart-input="pack"]').first();
    if (await packInput.isVisible().catch(() => false)) {
      await packInput.fill("10");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(600);
    }

    // Open Split Tender / Payment Panel
    const splitBtn = page.locator('button:has-text("Split Tender")');
    await spotlight('button:has-text("Split Tender")');
    await showKeyBadge("F8 · PAYMENT PANEL", "Open Settlement Drawer for Multi-Tender & Loyalty Redemption");
    await page.waitForTimeout(1400);

    await splitBtn.click();
    await page.waitForSelector('.bg-amber-50\\/70, div:has-text("Loyalty Points")', { timeout: 6000 });
    await page.waitForTimeout(800);

    // Spotlight the loyalty section in payment panel
    await spotlight(".bg-amber-50\\/70.border.border-amber-200");
    await showKeyBadge("REDEEM POINTS", "Available Points Balance Stamped with Row-Level Locking");
    await page.waitForTimeout(1600);

    // Click Redeem Max
    const redeemMaxBtn = page.locator('button:has-text("Redeem Max")');
    if (await redeemMaxBtn.isVisible()) {
      await redeemMaxBtn.click();
      await page.waitForTimeout(1000);
    }

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Bill Total Update & Audited Loyalty Discount
  await playScene(3, async () => {
    // Fill remaining cash tender
    const exactCashBtn = page.locator('button:has-text("Exact Cash")');
    if (await exactCashBtn.isVisible().catch(() => false)) {
      await exactCashBtn.click();
      await page.waitForTimeout(600);
    }

    // Spotlight applied loyalty discount and net payable
    await spotlight(".bg-amber-50\\/70, .border-t.border-ink-100");
    await showKeyBadge("LOYALTY DISCOUNT APPLIED", "Deducted from Bill Total · Verified by Backend Isolation");
    await page.waitForTimeout(2400);

    // Complete the checkout
    const completeBtn = page.locator('button:has-text("Complete Sale")').last();
    if (await completeBtn.isVisible().catch(() => false)) {
      await completeBtn.click();
      await page.waitForTimeout(1500);
    }

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Auto-Restoration on Reversals & Phase 2 Wrap-Up
  await playScene(4, async () => {
    await spotlight("main, .flex-1, body");
    await showKeyBadge("AUTOMATIC POINT RESTORATION", "Restores Points on Return/Cancellation · Phase 2 Complete!");
    await page.waitForTimeout(2800);

    await clearSpotlight();
    await clearKeyBadge();
  });
};
