import * as path from "node:path";
import type { ScenarioRunner } from "./types";

export const runVID4_5: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  console.log("Loading Bulk Stock CSV Import scenario...");
  await page.goto(`${baseUrl}/dashboard/inventory`);
  await page.waitForSelector('h1:has-text("Item master")', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Scene 1: Legacy Software Migration & Bulk Needs
  await playScene(0, async () => {
    await spotlight('h1:has-text("Item master")');
    await showKeyBadge("BULK STOCK IMPORT", "Ingest Thousands of Medicines from Marg/Busy Spreadsheets");
    await page.waitForTimeout(2000);

    const importLink = page.locator('a:has-text("Import")').first();
    if (await importLink.isVisible()) {
      await spotlight('a:has-text("Import")');
    }
    await page.waitForTimeout(1800);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Open Smart Import Portal
  await playScene(1, async () => {
    await page.goto(`${baseUrl}/dashboard/inventory/import`);
    await page.waitForSelector('h1:has-text("Smart Stock Import")', { timeout: 10000 });
    await page.waitForTimeout(600);

    const dropzone = page.locator(".border-dashed");
    if (await dropzone.isVisible()) {
      await spotlight(".border-dashed");
    }
    await showKeyBadge("SMART IMPORT PORTAL", "Client-Side PapaParse Engine · Zero Latency Processing");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Standard Spreadsheet Columns & Format Flexibility
  await playScene(2, async () => {
    const hint = page.locator("p:has-text('Don')");
    if (await hint.isVisible()) {
      await spotlight("p:has-text('Don')");
    } else {
      await spotlight(".border-dashed");
    }
    await showKeyBadge("FLEXIBLE SPREADSHEET", "Name · Batch Number · Expiry · Qty · MRP · Purchase Rate");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Upload CSV & Instant Client-Side Parsing
  await playScene(3, async () => {
    const fileInput = page.locator('input[type="file"]');
    const fixturePath = path.join(process.cwd(), "scripts/video_pipeline/fixtures/sample_inventory_import.csv");
    await fileInput.setInputFiles(fixturePath);
    await page.waitForTimeout(800);

    // Grid metrics appear
    const metrics = page.locator(".grid.grid-cols-3").first();
    if (await metrics.isVisible()) {
      await spotlight(".grid.grid-cols-3");
    }
    await showKeyBadge("INSTANT PARSE", "5 Rows Analyzed in Memory · Zero Server Upload Wait");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Automatic Fuzzy Header Mapping & Next Part
  await playScene(4, async () => {
    const table = page.locator("table");
    if (await table.isVisible()) {
      await spotlight("table");
    }
    await showKeyBadge("FUZZY HEADER MAPPING", "Vendor Columns Mapped · Next: AI Enrichment & Validation");
    await page.waitForTimeout(2400);

    await clearSpotlight();
    await clearKeyBadge();
  });
};
