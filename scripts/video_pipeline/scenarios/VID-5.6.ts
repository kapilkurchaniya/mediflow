import type { ScenarioRunner } from "./types";

export const runVID5_6: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  console.log("Loading Supplier Returns & Statutory Debit Notes scenario...");
  await page.goto(`${baseUrl}/dashboard/purchases/returns`);
  await page.waitForSelector('h1:has-text("Purchase Returns"), h1:has-text("Debit Notes")', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Scene 1: Welcome & Overview
  await playScene(0, async () => {
    await spotlight('h1, a[href*="/purchases/returns/new"]');
    await showKeyBadge("PURCHASE RETURNS", "Statutory GST Debit Notes · Near-Expiry & Damaged Returns");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Click New Return & Pick Original Purchase GRN
  await playScene(1, async () => {
    const newReturnBtn = page.locator('a[href*="/dashboard/purchases/returns/new"], a:has-text("New Return"), a:has-text("Issue Debit Note")').first();
    if (await newReturnBtn.isVisible()) {
      await newReturnBtn.click();
      await page.waitForSelector('h1:has-text("Issue Debit Note")', { timeout: 10000 });
      await page.waitForTimeout(600);
    }

    // Select purchase invoice
    const purchaseSelect = page.locator("select").first();
    if (await purchaseSelect.isVisible()) {
      const options = await purchaseSelect.locator("option").all();
      if (options.length > 1) {
        await purchaseSelect.selectOption({ index: 1 });
        await page.waitForTimeout(800);
      }
    }

    await spotlight("select:first-of-type, .card:has(select)");
    await showKeyBadge("LINK INWARD GRN", "Pulls Original Vendor Invoices, Billed Rates & Active Batches");
    await page.waitForTimeout(2000);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Select Return Reason & Input Return Qty
  await playScene(2, async () => {
    // Select reason
    const reasonSelect = page.locator("select").nth(1);
    if (await reasonSelect.isVisible()) {
      await reasonSelect.selectOption("Damaged in transit / broken seal");
      await page.waitForTimeout(400);
    }

    // Fill return quantity in table
    const qtyInput = page.locator('table input[type="number"]').first();
    if (await qtyInput.isVisible()) {
      await qtyInput.fill("2");
      await qtyInput.dispatchEvent("input");
      await page.waitForTimeout(600);
    }

    await spotlight("select:nth-of-type(2), table tbody tr:first-child");
    await showKeyBadge("RETURN REASON & QTY", "Expired Goods / Damaged Transit · Deducts Batch Inventory");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Automated GST Tax Reversal Calculation
  await playScene(3, async () => {
    const summaryCard = page.locator(".card:has-text('Total Debit Note'), .card:has-text('Subtotal'), table tfoot").first();
    if (await summaryCard.isVisible()) {
      await spotlight(".card:has-text('Total Debit Note'), .card:has-text('Subtotal')");
    }
    await showKeyBadge("GST TAX REVERSAL", "Reverses Input CGST & SGST · Exact Billed Rates Without Recalculation");
    await page.waitForTimeout(2400);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Confirm Return & View Issued Debit Note
  await playScene(4, async () => {
    const submitBtn = page.locator('button[type="submit"]:has-text("Confirm & Issue Debit Note"), button:has-text("Issue Debit Note")').first();
    if (await submitBtn.isVisible()) {
      await spotlight('button[type="submit"]');
      await page.waitForTimeout(800);
      await submitBtn.click();
      await page.waitForTimeout(1500);
    }

    const printBtn = page.locator('a[href*="/print"], a:has-text("Print Debit Note")').first();
    if (await printBtn.isVisible()) {
      await spotlight('a[href*="/print"], h1');
    }
    await showKeyBadge("DEBIT NOTE GENERATED", "GST Form GSTR-1 Compliant · Print Voucher & Deduct Vendor Payable");
    await page.waitForTimeout(2400);

    await clearSpotlight();
    await clearKeyBadge();
  });
};
