import type { ScenarioRunner } from "./types";

export const runVID4_3: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  console.log("Loading Racks & Shelves Management scenario...");
  await page.goto(`${baseUrl}/dashboard/settings/racks`);
  await page.waitForSelector('h1:has-text("Racks & Shelves Management")', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Scene 1: Physical Warehouse & Aisle Organization Overview
  await playScene(0, async () => {
    await spotlight('h1:has-text("Racks & Shelves Management")');
    await showKeyBadge("RACK & SHELF LAYOUT", "Physical Store Mapping · Eliminate Counter Search Delays");
    await page.waitForTimeout(2000);

    const addBtn = page.locator('button:has-text("Add Rack")').first();
    if (await addBtn.isVisible()) {
      await spotlight('button:has-text("Add Rack")');
    }
    await page.waitForTimeout(1800);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Review Existing Store Racks & Item Allocations
  await playScene(1, async () => {
    const table = page.locator("table");
    if (await table.isVisible()) {
      await spotlight("table");
    }
    await showKeyBadge("STORAGE DIRECTORY", "Existing Codes: R1-S1, R1-S2 · Medicine Counts");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Add New Rack Slot (R1-S3)
  await playScene(2, async () => {
    const addBtn = page.locator('button:has-text("Add Rack")').first();
    await addBtn.click();

    const codeInput = page.locator('input[placeholder*="R1-S3"]');
    await codeInput.waitFor({ state: "visible", timeout: 5000 });
    await page.waitForTimeout(400);

    await codeInput.fill("R1-S3");
    await page.waitForTimeout(300);

    const nameInput = page.locator('input[placeholder*="Front Counter"]');
    await nameInput.fill("Fast-Moving Antibiotics");
    await page.waitForTimeout(300);

    const descInput = page.locator("textarea");
    if (await descInput.isVisible()) {
      await descInput.fill("Shelf 3 for high-frequency prescription dispensing");
      await page.waitForTimeout(300);
    }

    await spotlight("form.card");
    await showKeyBadge("DEFINE PHYSICAL SLOT", "Code: R1-S3 · Fast-Moving Antibiotics Shelf");
    await page.waitForTimeout(2000);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Save & Synchronize Rack across Inventory
  await playScene(3, async () => {
    const submitBtn = page.locator('button[type="submit"]:has-text("Create Rack")');
    await spotlight('button[type="submit"]:has-text("Create Rack")');
    await showKeyBadge("REGISTER SLOT", "Commit R1-S3 to Central Store Floor Plan");
    await page.waitForTimeout(1000);

    await submitBtn.click();
    await page.waitForSelector("form.card", { state: "detached", timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(800);

    const table = page.locator("table");
    if (await table.isVisible()) {
      await spotlight("table tbody tr:first-child");
    }
    await showKeyBadge("RACK CREATED", "R1-S3 Active · Item Master Linked");
    await page.waitForTimeout(2000);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Counter Search & 3-Second Rapid Retrieval
  await playScene(4, async () => {
    await page.goto(`${baseUrl}/dashboard/sales/pos`);
    const searchInput = page.locator('input[placeholder*="Search medicine"]');
    await searchInput.waitFor({ state: "visible", timeout: 10000 });
    await page.waitForTimeout(600);

    await spotlight('input[placeholder*="Search medicine"]');
    await searchInput.fill("Augmentin");
    await page.waitForTimeout(800);

    await showKeyBadge("INSTANT PICKING", "Aisle Code R1-S3 Populates at POS · Under 3s Retrieval");
    await page.waitForTimeout(2400);

    await clearSpotlight();
    await clearKeyBadge();
  });
};
