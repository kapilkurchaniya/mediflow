import type { ScenarioRunner } from "./types";

export const runVID4_8: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  console.log("Loading Configuring Supplier Trade Schemes scenario...");
  await page.goto(`${baseUrl}/dashboard/settings/schemes`);
  await page.waitForSelector('h1:has-text("Trade Schemes")', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Scene 1: Welcome & Trade Schemes Overview
  await playScene(0, async () => {
    await spotlight('h1:has-text("Trade Schemes")');
    await showKeyBadge("TRADE SCHEMES", "Automate Bonus Units & Landed Cost Dilution Across ERP");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Navigate to Scheme Creation Builder
  await playScene(1, async () => {
    const createBtn = page.locator('a:has-text("Create Scheme")').first();
    if (await createBtn.isVisible()) {
      await spotlight('a:has-text("Create Scheme")');
    }
    await showKeyBadge("PROMOTION BUILDER", "Configurable Buy X Get Y, Volume %, Flat & Tiered Deals");
    await page.waitForTimeout(1600);

    if (await createBtn.isVisible()) {
      await createBtn.click();
      await page.waitForSelector('h1:has-text("Create New Scheme")', { timeout: 10000 });
      await page.waitForTimeout(600);
    }

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Buy X Get Y Parameters (10 + 1 Free)
  await playScene(2, async () => {
    // Fill title
    const titleInput = page.locator('input[placeholder*="Paracetamol"]').first();
    if (await titleInput.isVisible()) {
      await titleInput.fill("Paracetamol Buy 10 Get 1 Free Promo");
    }

    // Spotlight Buy X Get Y card
    const freeQtyCard = page.locator('button:has-text("Buy X Get Y")').first();
    if (await freeQtyCard.isVisible()) {
      await spotlight('button:has-text("Buy X Get Y")');
    }
    await showKeyBadge("BUY X GET Y", "10 Purchased Units = 1 Bonus Free Stock Unit");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Target Scope Selection
  await playScene(3, async () => {
    const medSelect = page.locator("select").first();
    if (await medSelect.isVisible()) {
      await spotlight("select");
      // Choose second option if available
      const options = await medSelect.locator("option").all();
      if (options.length > 1) {
        const val = await options[1].getAttribute("value");
        if (val) await medSelect.selectOption(val);
      }
    }
    await showKeyBadge("TARGET SCOPE", "Granular SKU Targeting · Applies to Counter POS & Inward GRNs");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Save Promotion & Live System Status
  await playScene(4, async () => {
    const submitBtn = page.locator('button[type="submit"]').first();
    if (await submitBtn.isVisible()) {
      await spotlight('button[type="submit"]');
    }
    await showKeyBadge("LIVE SCHEME", "Immediate Activation · Phase 4 100% Completed!");
    await page.waitForTimeout(1500);

    if (await submitBtn.isVisible()) {
      await submitBtn.click();
      try {
        await page.waitForURL("**/dashboard/settings/schemes", { timeout: 8000 });
        await page.waitForTimeout(800);
        await spotlight("table");
      } catch (e) {
        console.log("Scheme navigation completed or handled");
      }
    }
    await page.waitForTimeout(1500);

    await clearSpotlight();
    await clearKeyBadge();
  });
};
