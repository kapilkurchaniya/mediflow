import type { ScenarioRunner } from "./types";

export const runVID5_5: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  console.log("Loading One-Click Inward GRN Receipt against PO scenario...");
  await page.goto(`${baseUrl}/dashboard/purchases/orders`);
  await page.waitForSelector('h1:has-text("Purchase Orders")', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Scene 1: Welcome & PO-to-GRN Overview
  await playScene(0, async () => {
    await spotlight('h1:has-text("Purchase Orders")');
    await showKeyBadge("PO TO GRN", "Direct Inward Conversion · Zero Data Duplication");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Open Approved PO & Click Receive GRN
  await playScene(1, async () => {
    // Click on the first order link in the table
    const firstOrderLink = page.locator("table a[href*='/dashboard/purchases/orders/']").first();
    if (await firstOrderLink.isVisible()) {
      await firstOrderLink.click();
      await page.waitForSelector("button, a", { timeout: 10000 });
      await page.waitForTimeout(600);
    }

    // If order is in draft, approve it first
    const approveBtn = page.locator('button:has-text("Approve PO"), button:has-text("Approve Order")').first();
    if (await approveBtn.isVisible()) {
      await approveBtn.click();
      await page.waitForTimeout(600);
    }

    const receiveBtn = page.locator('a:has-text("Receive GRN")').first();
    if (await receiveBtn.isVisible()) {
      await spotlight('a:has-text("Receive GRN")');
      await showKeyBadge("RECEIVE GOODS", "1-Click Direct Conversion to Goods Receipt Note");
      await page.waitForTimeout(1600);
      await receiveBtn.click();
      await page.waitForSelector('h1:has-text("Record Purchase Invoice")', { timeout: 10000 });
      await page.waitForTimeout(600);
    }

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Inspect Linked PO Banner & Auto-Loaded Lines
  await playScene(2, async () => {
    const banner = page.locator('.card:has-text("Receiving goods against"), .card:has-text("Purchase Order")').first();
    if (await banner.isVisible()) {
      await spotlight('.card:has-text("Receiving goods against"), .card:has-text("Purchase Order")');
    }
    await showKeyBadge("PRE-FILLED INWARD", "Supplier, SKU Items, Quantities & Rates Loaded Automatically");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Invoice No, Received Batch & Expiry Entry
  await playScene(3, async () => {
    const invInput = page.locator('input[placeholder*="INV"], input[name="supplierInvoiceNo"]').first();
    if (await invInput.isVisible()) {
      await invInput.fill("INV-2026-9921");
    }

    const batchInput = page.locator('table input[placeholder*="BATCH"], table input[placeholder*="Batch"]').first();
    if (await batchInput.isVisible()) {
      await batchInput.fill("LOT-5510");
    }

    const expiryInput = page.locator('table input[type="date"]').first();
    if (await expiryInput.isVisible()) {
      await expiryInput.fill("2027-12-31");
    }

    await spotlight("input[placeholder*='INV'], table tr:has(input)");
    await showKeyBadge("VERIFY & BATCH", "Match Delivery Quantities · Enter Lot Numbers & Expiry");
    await page.waitForTimeout(2400);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Save Inward Bill & PO Marked Received
  await playScene(4, async () => {
    const submitBtn = page.locator('button[type="submit"]:has-text("Save inward bill")').first();
    if (await submitBtn.isVisible()) {
      await spotlight('button[type="submit"]:has-text("Save inward bill")');
    }
    await showKeyBadge("GRN COMMITTED", "PO Auto-Marked Received · Inventory Active at POS Counters");
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
