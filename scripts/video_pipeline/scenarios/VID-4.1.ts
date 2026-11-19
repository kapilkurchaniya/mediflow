import type { ScenarioRunner } from "./types";

export const runVID4_1: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  console.log("Loading New Medicine Master scenario...");
  await page.goto(`${baseUrl}/dashboard/inventory/new`);
  await page.waitForSelector('input#name', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Scene 1: Welcome to Phase 4 & Inventory Master Overview
  await playScene(0, async () => {
    await spotlight('h1:has-text("New item")');
    await showKeyBadge("ITEM MASTER", "Medicine Catalogue · Trade Brands & Salt Formulations");
    await page.waitForTimeout(2000);

    await spotlight('form.card');
    await page.waitForTimeout(1800);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Brand Name & Generic Salt Formulation
  await playScene(1, async () => {
    const nameInput = page.locator("input#name");
    await nameInput.fill("Augmentin 625 Duo Tablet");
    await page.waitForTimeout(300);

    const genericInput = page.locator("input#genericName");
    await genericInput.fill("Amoxicillin 500mg + Potassium Clavulanate 125mg");
    await page.waitForTimeout(300);

    const catSelect = page.locator("select#categoryId");
    const catCount = await catSelect.locator("option").count();
    if (catCount > 1) {
      await catSelect.selectOption({ index: 1 });
    }

    const mfgSelect = page.locator("select#manufacturerId");
    const mfgCount = await mfgSelect.locator("option").count();
    if (mfgCount > 1) {
      await mfgSelect.selectOption({ index: 1 });
    }

    await spotlight('input#name, input#genericName');
    await showKeyBadge("BRAND & MOLECULE", "Augmentin 625 Duo · Amoxicillin + Clavulanic Acid");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Pricing, GST 2.0 & HSN Code Setup
  await playScene(2, async () => {
    const mrpInput = page.locator("input#mrp");
    await mrpInput.fill("223.50");
    await page.waitForTimeout(200);

    const saleInput = page.locator("input#salePrice");
    await saleInput.fill("210.00");
    await page.waitForTimeout(200);

    const gstSelect = page.locator("select#gstRateBp");
    await gstSelect.selectOption("5");
    await page.waitForTimeout(200);

    const hsnInput = page.locator("input#hsn");
    await hsnInput.fill("30049099");
    await page.waitForTimeout(200);

    await spotlight('input#mrp, select#gstRateBp, input#hsn');
    await showKeyBadge("GST 2.0 & PRICING", "MRP ₹223.50 · 5% GST 2.0 Reform Slab · HSN 30049099");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Packaging Units, Schedule H1 & Rx Requirement
  await playScene(3, async () => {
    const unitSelect = page.locator("select#unit");
    await unitSelect.selectOption("strip");
    await page.waitForTimeout(200);

    const packInput = page.locator("input#packSize");
    await packInput.fill("10 tablets");
    await page.waitForTimeout(200);

    const schedSelect = page.locator("select#schedule");
    await schedSelect.selectOption("H1");
    await page.waitForTimeout(200);

    const rxCheck = page.locator("input#rxRequired");
    await rxCheck.check();
    await page.waitForTimeout(200);

    await spotlight('select#schedule, input#rxRequired, select#unit');
    await showKeyBadge("SCHEDULE & RX", "Strip of 10 Tabs · Schedule H1 · Rx Prompt at POS");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Physical Storage Rack Assignment & Master Save
  await playScene(4, async () => {
    const rackSelect = page.locator("select#rackId");
    const rackCount = await rackSelect.locator("option").count();
    if (rackCount > 1) {
      await rackSelect.selectOption({ index: 1 });
      await page.waitForTimeout(300);
    }

    const saveBtn = page.locator('button[type="submit"]:has-text("Save item")');
    await spotlight('button[type="submit"]:has-text("Save item")');
    await showKeyBadge("SAVE TO MASTER", "Register Medicine across ERP & Supply Chain");
    await page.waitForTimeout(1000);

    await saveBtn.click();
    await page.waitForURL("**/dashboard/inventory**", { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(800);

    const table = page.locator("table");
    if (await table.isVisible()) {
      await spotlight("table tbody tr:first-child");
    } else {
      await spotlight(".page");
    }
    await showKeyBadge("MEDICINE CATALOGED", "Augmentin 625 Duo · Ready for GRN Purchase & POS");
    await page.waitForTimeout(2400);

    await clearSpotlight();
    await clearKeyBadge();
  });
};
