import type { ScenarioRunner } from "./types";

export const runVID6_3: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  console.log("Loading Pharmacy Loyalty Rewards Program scenario...");
  await page.goto(`${baseUrl}/dashboard/settings/loyalty`);
  await page.waitForSelector('h1, input#pointsPerRupee', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Scene 1: Welcome & Rewards Program Overview
  await playScene(0, async () => {
    await spotlight("form.card, h1");
    await showKeyBadge("LOYALTY PROGRAM", "Customer Retention · Points Accrual & Redemption Rules");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Points Settings Page Navigation
  await playScene(1, async () => {
    await spotlight(".card-body, form");
    await showKeyBadge("RULE CONFIGURATION", "Centralized Multi-Terminal Earning & Rupee Valuation Rules");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Points Accrual Earning Ratio
  await playScene(2, async () => {
    const earningInput = page.locator("#pointsPerRupee");
    if (await earningInput.isVisible()) {
      await earningInput.fill("2");
      await page.waitForTimeout(400);
    }

    await spotlight("#pointsPerRupee, div:has(> #pointsPerRupee)");
    await showKeyBadge("EARNING RATIO", "Award 2 Points Per ₹100 of Eligible Billed Sales");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Redemption Rupee Value & Minimum Threshold
  await playScene(3, async () => {
    const valueInput = page.locator("#redemptionValueRupees");
    if (await valueInput.isVisible()) {
      await valueInput.fill("1.00");
    }

    const minInput = page.locator("#minRedemptionPoints");
    if (await minInput.isVisible()) {
      await minInput.fill("10");
    }

    await spotlight("#redemptionValueRupees, #minRedemptionPoints");
    await showKeyBadge("REDEMPTION PARAMETERS", "1 Point = ₹1.00 Discount · Min 10 Points Required at POS");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Save Loyalty Rules & Terminal Activation
  await playScene(4, async () => {
    const saveBtn = page.locator('button:has-text("Save Loyalty Settings")').first();
    if (await saveBtn.isVisible()) {
      await spotlight('button:has-text("Save Loyalty Settings")');
      await page.waitForTimeout(800);
      await saveBtn.click();
      await page.waitForTimeout(1400);
    }

    await spotlight(".alert-success, form");
    await showKeyBadge("PROGRAM ACTIVE", "Automated Point Accrual Live Across All Billing Terminals");
    await page.waitForTimeout(2400);

    await clearSpotlight();
    await clearKeyBadge();
  });
};
