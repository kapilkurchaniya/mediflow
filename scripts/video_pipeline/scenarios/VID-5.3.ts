import type { ScenarioRunner } from "./types";

export const runVID5_3: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  console.log("Loading Pharma Schemes, TD, CD & Landed Cost scenario...");
  await page.goto(`${baseUrl}/dashboard/purchases/new`);
  await page.waitForSelector('h1:has-text("Record Purchase Invoice")', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Scene 1: Welcome & Trade Schemes Valuation Impact
  await playScene(0, async () => {
    await spotlight('h1:has-text("Record Purchase Invoice")');
    await showKeyBadge("TRADE SCHEMES", "Bonus Goods, TD%, CD% & Diluted Landed Cost Calculation");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: 10 + 1 Free Scheme Setup
  await playScene(1, async () => {
    const addRowBtn = page.locator('button:has-text("Add Row")');
    if (await addRowBtn.isVisible()) {
      await addRowBtn.click();
      await page.waitForTimeout(500);
    }

    // Select Medicine
    const medSelect = page.locator("table select").first();
    if (await medSelect.isVisible()) {
      const options = await medSelect.locator("option").all();
      if (options.length > 1) {
        const val = await options[1].getAttribute("value");
        if (val) await medSelect.selectOption(val);
      }
    }

    // Batch & Expiry
    const batchInput = page.locator('table input[placeholder*="BATCH"], table input[placeholder*="Batch"]').first();
    if (await batchInput.isVisible()) await batchInput.fill("SCH-1001");
    const expiryInput = page.locator('table input[type="date"]').first();
    if (await expiryInput.isVisible()) await expiryInput.fill("2027-10-31");

    // Billed Qty = 10, Free Qty = 1
    const qtyInput = page.locator('table input[type="number"]').first();
    if (await qtyInput.isVisible()) await qtyInput.fill("10");

    const freeQtyInput = page.locator('table input[placeholder="0"]').first();
    if (await freeQtyInput.isVisible()) await freeQtyInput.fill("1");

    await spotlight("table tr:has(input)");
    await showKeyBadge("10+1 FREE SCHEME", "10 Billed Packs + 1 Bonus Free Pack = 11 Received Units");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Landed Cost Dilution Across 11 Packs
  await playScene(2, async () => {
    // Fill Rate ₹100
    const costInput = page.locator('table input[placeholder="0.00"]').first();
    if (await costInput.isVisible()) {
      await costInput.fill("100.00");
    }

    // Fill MRP ₹150
    const mrpInput = page.locator('table input[placeholder="0.00"]').nth(1);
    if (await mrpInput.isVisible()) {
      await mrpInput.fill("150.00");
    }

    await spotlight("table tr:has(input)");
    await showKeyBadge("COST DILUTION", "Purchase Cost Spread Across 11 Units: ₹100.00 → ₹90.91 / Pack");
    await page.waitForTimeout(2400);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Trade Discount (TD%) & Cash Discount (CD%)
  await playScene(3, async () => {
    // Fill TD% = 5%
    const tdInput = page.locator('table input[placeholder="0"]').nth(1);
    if (await tdInput.isVisible()) {
      await tdInput.fill("5");
    }

    // Fill CD% = 2%
    const cdInput = page.locator('table input[placeholder="0"]').nth(2);
    if (await cdInput.isVisible()) {
      await cdInput.fill("2");
    }

    await spotlight("table tr:has(input)");
    await showKeyBadge("TD% & CD% SAVINGS", "Trade Discount Pre-GST · Cash Discount Deducted on Payment");
    await page.waitForTimeout(2400);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Exact Profit Margins & Next Part
  await playScene(4, async () => {
    const totalsCard = page.locator(".card:has-text('Subtotal'), .card:has-text('Total'), .card:has-text('Summary')").last();
    if (await totalsCard.isVisible()) {
      await spotlight(".card:has-text('Subtotal'), .card:has-text('Total'), .card:has-text('Summary')");
    }
    await showKeyBadge("TRUE PROFIT MARGINS", "Guaranteed Margin Accuracy When Dispensed at POS Counters");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });
};
