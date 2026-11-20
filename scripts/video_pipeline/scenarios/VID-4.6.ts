import * as path from "node:path";
import type { ScenarioRunner } from "./types";

export const runVID4_6: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  console.log("Loading Bulk Import Preview, Validation & AI Enrichment scenario...");
  await page.goto(`${baseUrl}/dashboard/inventory/import`);
  await page.waitForSelector('h1:has-text("Smart Stock Import")', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Upload the sample CSV with 1 warning row (Azithral with MRP 0)
  const fileInput = page.locator('input[type="file"]');
  const fixturePath = path.join(process.cwd(), "scripts/video_pipeline/fixtures/sample_inventory_enrich.csv");
  await fileInput.setInputFiles(fixturePath);
  await page.waitForTimeout(800);

  // Scene 1: Welcome & Pre-Import Validation Overview
  await playScene(0, async () => {
    const table = page.locator("table");
    if (await table.isVisible()) {
      await spotlight("table");
    }
    await showKeyBadge("ROW VALIDATION", "Automated Pre-Import Syntax & Integrity Verification");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Examine Status Dashboard & Row Warnings
  await playScene(1, async () => {
    const metrics = page.locator(".grid.grid-cols-3").first();
    if (await metrics.isVisible()) {
      await spotlight(".grid.grid-cols-3");
    }
    await showKeyBadge("STATUS DASHBOARD", "Green = Ready to Import · Yellow = Missing MRPs Flagged");
    await page.waitForTimeout(2000);

    // Spotlight the warning badge row
    const warningRow = page.locator("tr.bg-amber-50\\/50").first();
    if (await warningRow.isVisible()) {
      await spotlight("tr.bg-amber-50\\/50");
    }
    await page.waitForTimeout(1800);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Click Auto-Enrich Missing Data
  await playScene(2, async () => {
    const enrichBtn = page.locator('button:has-text("Auto-Enrich Missing Data")');
    if (await enrichBtn.isVisible()) {
      await spotlight('button:has-text("Auto-Enrich Missing Data")');
    }
    await showKeyBadge("AI AUTO-ENRICHMENT", "Scan Indian Pharma DB · Fill Missing Manufacturers & MRPs");
    await page.waitForTimeout(1800);

    if (await enrichBtn.isVisible()) {
      await enrichBtn.click();
      await page.waitForTimeout(2000);
    }

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Inspect Refreshed Table with Resolved Warnings
  await playScene(3, async () => {
    const table = page.locator("table");
    if (await table.isVisible()) {
      await spotlight("table");
    }
    await showKeyBadge("CATALOG ENRICHED", "All Rows 100% Validated · Market Rates & Metadata Attached");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Commit Import & Batches Generated
  await playScene(4, async () => {
    const importBtn = page.locator('button:has-text("Import All Data"), button:has-text("Import")').last();
    if (await importBtn.isVisible()) {
      await spotlight('button:has-text("Import All Data"), button:has-text("Import")');
    }
    await showKeyBadge("COMMIT INVENTORY", "Bulk Batch Generation · Instant Availability at POS Counter");
    await page.waitForTimeout(1500);

    if (await importBtn.isVisible()) {
      await importBtn.click();
      try {
        await page.waitForURL("**/dashboard/inventory/batches", { timeout: 8000 });
        await page.waitForTimeout(800);
        await spotlight("table");
      } catch (e) {
        console.log("Import navigation timed out or handled");
      }
    }
    await page.waitForTimeout(1500);

    await clearSpotlight();
    await clearKeyBadge();
  });
};
