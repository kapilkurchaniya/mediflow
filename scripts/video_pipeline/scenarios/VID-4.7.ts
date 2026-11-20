import type { ScenarioRunner } from "./types";

export const runVID4_7: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  console.log("Loading Monitoring Batches & Near-Expiry scenario...");
  await page.goto(`${baseUrl}/dashboard/inventory/batches`);
  await page.waitForSelector('h1:has-text("Batches & stock")', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Scene 1: Welcome & Expiry Tracking Overview
  await playScene(0, async () => {
    await spotlight('h1:has-text("Batches & stock")');
    await showKeyBadge("EXPIRY TRACKING", "Continuous Audit of Drug Shelf Life & Regulatory Compliance");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Stat Cards (Active Batches, PTR Valuation, Expiring <=90 Days)
  await playScene(1, async () => {
    const statsGrid = page.locator(".grid.grid-cols-1.gap-4.md\\:grid-cols-3").first();
    if (await statsGrid.isVisible()) {
      await spotlight(".grid.grid-cols-1.gap-4.md\\:grid-cols-3");
    }
    await showKeyBadge("EXPOSURE METRICS", "Active Lots · PTR Valuation · Batches Expiring in ≤90 Days");
    await page.waitForTimeout(2200);

    // Spotlight the danger card specifically
    const expiringCard = page.locator("section.grid > div").nth(2);
    if (await expiringCard.isVisible()) {
      await spotlight("section.grid > div:nth-child(3)");
    }
    await page.waitForTimeout(1800);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Filter Tab (Expiring in <= 90 Days)
  await playScene(2, async () => {
    const nearExpiryTab = page.locator('a[href*="nearExpiry=true"]').first();
    if (await nearExpiryTab.isVisible()) {
      await spotlight('a[href*="nearExpiry=true"]');
      await showKeyBadge("FILTER CRITICAL STOCK", "One-Click Isolation of Near-Expiry Batches");
      await page.waitForTimeout(1800);
      await nearExpiryTab.click();
      await page.waitForTimeout(1200);
    }

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Urgency Badges (<=30 Days Red, <=90 Days Yellow, Expired)
  await playScene(3, async () => {
    const table = page.locator("table");
    if (await table.isVisible()) {
      await spotlight("table");
    }
    await showKeyBadge("URGENCY BADGES", "Red = ≤30 Days / Expired · Yellow = ≤90 Days Alert");
    await page.waitForTimeout(2400);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Action Plan & Next Part
  await playScene(4, async () => {
    const exportBtn = page.locator('button:has-text("Export"), a:has-text("Export")').first();
    if (await exportBtn.isVisible()) {
      await spotlight('button:has-text("Export"), a:has-text("Export")');
    }
    await showKeyBadge("PROMPT ACTION", "Export Audit Sheet · Return to Supplier Before Expiry");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });
};
