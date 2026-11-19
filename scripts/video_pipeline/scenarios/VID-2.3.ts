import type { ScenarioRunner } from "./types";

export const runVID2_3: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  // Navigate to POS billing counter
  console.log("Loading POS billing counter for Loose Tablet / Fractional Billing scenario...");
  await page.goto(`${baseUrl}/dashboard/sales/pos`);
  await page.waitForSelector('input[placeholder*="Search medicine"]', { timeout: 10000 });
  await page.waitForTimeout(500);

  // Scene 1: Welcome & Overview of Fractional Strip Cutting
  await playScene(0, async () => {
    await spotlight('h1:has-text("POS Billing Counter")');
    await showKeyBadge("STRIP CUTTING", "Fractional Unit Billing");
    await page.waitForTimeout(1600);

    // Select customer if available
    const customerSelect = page.locator("select").first();
    if ((await customerSelect.count()) > 0) {
      await spotlight("select:first-of-type");
      const options = await customerSelect.locator("option").allTextContents();
      const rameshOption = options.find((o) => o.includes("Ramesh"));
      if (rameshOption) {
        await customerSelect.selectOption({ label: rameshOption });
      }
      await page.waitForTimeout(1400);
    }

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Add Paracetamol 650 (1 Strip = 15 Tablets)
  await playScene(1, async () => {
    const searchInput = page.locator('input[placeholder*="Search medicine"]');
    await spotlight('input[placeholder*="Search medicine"]');
    await showKeyBadge("F3", "Search Paracetamol 650");
    await page.waitForTimeout(600);

    await searchInput.fill("");
    await searchInput.pressSequentially("Paracetamol", { delay: 65 });
    await searchInput.press("Enter");

    // Wait for dropdown results
    const firstResult = page.locator(".card.shadow-pop table.data-table tbody tr").first();
    await firstResult.waitFor({ state: "visible", timeout: 6000 });
    await firstResult.click();
    await page.waitForTimeout(800);

    // Spotlight the active cart item row showing units per pack
    const cartRow = page.locator(".card table.data-table tbody tr").first();
    await cartRow.waitFor({ state: "visible", timeout: 6000 });
    await spotlight(".card table.data-table tbody tr");
    await showKeyBadge("PARACETAMOL 650", "1 Strip = 15 Tablets");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Sell 5 Loose Tablets (Pro-Rata Rate)
  await playScene(2, async () => {
    const cartRow = page.locator(".card table.data-table tbody tr").first();
    const packInput = cartRow.locator('input[type="number"]').first();
    const looseInput = cartRow.locator('input[type="number"]').nth(1);

    // Spotlight the quantity columns
    await spotlight(".card table.data-table tbody tr td:nth-child(4), .card table.data-table tbody tr td:nth-child(5)");
    await showKeyBadge("PATIENT WANTS 5 TABLETS", "Cutting the Strip");
    await page.waitForTimeout(1200);

    // Set Packs to 0
    await packInput.click();
    await packInput.fill("0");
    await page.waitForTimeout(500);

    // Set Loose to 5
    await looseInput.click();
    await looseInput.fill("5");
    await page.waitForTimeout(800);

    // Spotlight line total and Net Payable showing pro-rata ₹10.00
    const summaryCard = page.locator('.card:has-text("Net Payable")').last();
    if (await summaryCard.isVisible()) {
      await spotlight('.card:has-text("Net Payable")');
    }
    await showKeyBadge("PRO-RATA: ₹10.00", "5 / 15 Tablets Calculated");
    await page.waitForTimeout(2500);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Combo Sale: 1 Full Strip + 5 Loose Tablets
  await playScene(3, async () => {
    const cartRow = page.locator(".card table.data-table tbody tr").first();
    const packInput = cartRow.locator('input[type="number"]').first();

    // Spotlight the pack input
    await spotlight(".card table.data-table tbody tr td:nth-child(4)");
    await showKeyBadge("COMBO SALE", "1 Full Pack + 5 Loose");
    await page.waitForTimeout(1000);

    // Change Packs to 1
    await packInput.click();
    await packInput.fill("1");
    await page.waitForTimeout(800);

    // Spotlight Net Payable showing ₹40.00 (15 + 5 = 20 tablets total)
    const summaryCard = page.locator('.card:has-text("Net Payable")').last();
    if (await summaryCard.isVisible()) {
      await spotlight('.card:has-text("Net Payable")');
    }
    await showKeyBadge("TOTAL: ₹40.00", "20 Units Deducted from Stock");
    await page.waitForTimeout(2500);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Outro & Next Steps
  await playScene(4, async () => {
    // Spotlight Finalize Bill button
    const submitBtn = page.locator('button:has-text("Finalize Bill")');
    if (await submitBtn.isVisible()) {
      await spotlight('button:has-text("Finalize Bill")');
    }
    await showKeyBadge("ACCURATE STOCK", "Next: Customer Quick Add (F4)");
    await page.waitForTimeout(3000);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Cleanup
  await clearSpotlight();
  await clearKeyBadge();
  await page.waitForTimeout(300);
};
