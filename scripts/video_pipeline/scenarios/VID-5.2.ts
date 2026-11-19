import type { ScenarioRunner } from "./types";

export const runVID5_2: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  console.log("Loading Recording a Supplier Bill (GRN) Inward Entry scenario...");
  await page.goto(`${baseUrl}/dashboard/purchases`);
  await page.waitForSelector('h1:has-text("Purchases")', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Scene 1: Welcome & Purchase Inward Overview
  await playScene(0, async () => {
    await spotlight('h1:has-text("Purchases")');
    await showKeyBadge("PURCHASE INWARD", "Distributor Invoicing & Goods Receipt Note (GRN) Processing");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Open Inward Form & Supplier Header Details
  await playScene(1, async () => {
    const inwardBtn = page.locator('a[href*="/purchases/new"], a:has-text("Inward stock"), a:has-text("Record purchase")').first();
    if (await inwardBtn.isVisible()) {
      await inwardBtn.click();
      await page.waitForSelector('h1:has-text("Record Purchase Invoice")', { timeout: 10000 });
      await page.waitForTimeout(600);
    }

    // Select Supplier
    const supplierSelect = page.locator("select").first();
    if (await supplierSelect.isVisible()) {
      const options = await supplierSelect.locator("option").all();
      if (options.length > 1) {
        const val = await options[1].getAttribute("value");
        if (val) await supplierSelect.selectOption(val);
      }
    }

    // Enter Invoice No
    const invInput = page.locator('input[placeholder*="INV"], input[name="supplierInvoiceNo"]').first();
    if (await invInput.isVisible()) {
      await invInput.fill("INV-2026-9041");
    }

    await spotlight("select, input[placeholder*='INV']");
    await showKeyBadge("INVOICE DETAILS", "Registered Distributor Selection · Physical Bill No & Date");
    await page.waitForTimeout(2400);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Add Medicine Line Item & Batch Details
  await playScene(2, async () => {
    const addRowBtn = page.locator('button:has-text("Add Row")');
    if (await addRowBtn.isVisible()) {
      await addRowBtn.click();
      await page.waitForTimeout(500);
    }

    // Select Medicine in Table
    const tableMedSelect = page.locator("table select").first();
    if (await tableMedSelect.isVisible()) {
      const options = await tableMedSelect.locator("option").all();
      if (options.length > 1) {
        const val = await options[1].getAttribute("value");
        if (val) await tableMedSelect.selectOption(val);
      }
    }

    // Fill Batch No
    const batchInput = page.locator('table input[placeholder*="BATCH"], table input[placeholder*="Batch"]').first();
    if (await batchInput.isVisible()) {
      await batchInput.fill("BAT-7720");
    }

    // Fill Expiry Date
    const expiryInput = page.locator('table input[type="date"]').first();
    if (await expiryInput.isVisible()) {
      await expiryInput.fill("2027-11-30");
    }

    // Fill Qty
    const qtyInput = page.locator('table input[type="number"]').first();
    if (await qtyInput.isVisible()) {
      await qtyInput.fill("100");
    }

    await spotlight("table tr:has(input)");
    await showKeyBadge("BATCH & QUANTITY", "Vendor Batch Number · Expiry Verification · Physical Qty");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Purchase Rate, MRP & GST Application
  await playScene(3, async () => {
    // Fill Rate (Cost per Pack)
    const costInput = page.locator('table input[placeholder="0.00"]').first();
    if (await costInput.isVisible()) {
      await costInput.fill("165.00");
    }

    // Fill MRP
    const mrpInput = page.locator('table input[placeholder="0.00"]').nth(1);
    if (await mrpInput.isVisible()) {
      await mrpInput.fill("223.50");
    }

    await spotlight("table tr:has(input)");
    await showKeyBadge("PRICING & GST", "Automatic Profit Margin Validation · Statutory Tax Slab");
    await page.waitForTimeout(2400);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Review Totals & Commit GRN Inward
  await playScene(4, async () => {
    const submitBtn = page.locator('button[type="submit"]:has-text("Save inward bill"), button:has-text("Save inward bill")').first();
    if (await submitBtn.isVisible()) {
      await spotlight('button:has-text("Save inward bill")');
    }
    await showKeyBadge("GRN COMMITTED", "Instant Batch Generation & Inventory Live at POS Counters");
    await page.waitForTimeout(1600);

    if (await submitBtn.isVisible()) {
      await submitBtn.click();
      try {
        await page.waitForURL("**/dashboard/purchases", { timeout: 8000 });
        await page.waitForTimeout(800);
        await spotlight("table");
      } catch (e) {
        console.log("GRN save navigation completed or handled");
      }
    }
    await page.waitForTimeout(1500);

    await clearSpotlight();
    await clearKeyBadge();
  });
};
