import type { ScenarioRunner } from "./types";

export const runVID5_7: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  console.log("Loading Supplier Ledgers & Payment Vouchers scenario...");
  await page.goto(`${baseUrl}/dashboard/suppliers`);
  await page.waitForSelector('h1:has-text("Suppliers")', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Scene 1: Supplier Directory & Payables Overview
  await playScene(0, async () => {
    await spotlight("table, h1");
    await showKeyBadge("SUPPLIER LEDGERS", "Vendor Directory · Closing Payables & Audit Trail");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Open Supplier Profile & Inspect Ledger Balance
  await playScene(1, async () => {
    const firstSupplier = page.locator("table tbody tr td a").first();
    if (await firstSupplier.isVisible()) {
      await firstSupplier.click();
      await page.waitForSelector('h1, a:has-text("Record Payment")', { timeout: 10000 });
      await page.waitForTimeout(600);
    }

    await spotlight(".card:has-text('Closing Balance'), .card:has-text('Purchases'), h1");
    await showKeyBadge("LEDGER SUMMARY", "Real-Time Outstanding Dues · Debit Notes & Historic Payments");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Navigate to Record Payment Portal & Select Invoice
  await playScene(2, async () => {
    const payBtn = page.locator('a:has-text("Record Payment")').first();
    if (await payBtn.isVisible()) {
      await spotlight('a:has-text("Record Payment")');
      await page.waitForTimeout(600);
      await payBtn.click();
      await page.waitForSelector('h1:has-text("Record Payment")', { timeout: 10000 });
      await page.waitForTimeout(600);
    }

    // Select invoice from open invoices table if available
    const invoiceRow = page.locator(".space-y-2 > div.cursor-pointer").first();
    if (await invoiceRow.isVisible()) {
      await invoiceRow.click();
      await page.waitForTimeout(400);
    } else {
      const payFullBtn = page.locator('button:has-text("Pay Full Balance")').first();
      if (await payFullBtn.isVisible()) {
        await payFullBtn.click();
        await page.waitForTimeout(400);
      }
    }

    // Ensure amount is entered
    const amtInput = page.locator("input[type='number']").first();
    if (await amtInput.isVisible()) {
      const val = await amtInput.inputValue();
      if (!val || val === "0" || val === "0.00") {
        await amtInput.fill("1500.00");
      }
    }

    await spotlight("input[type='number'], .space-y-2");
    await showKeyBadge("BILL SETTLEMENT", "Target Specific Purchase Invoices or Post Lump-Sum Payments");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Choose Payment Method & Input Bank Reference
  await playScene(3, async () => {
    // Select payment method
    const methodSelect = page.locator("select").first();
    if (await methodSelect.isVisible()) {
      await methodSelect.selectOption("bank");
      await page.waitForTimeout(300);
    }

    const refInput = page.locator('input[placeholder*="UTR"], input[placeholder*="Cheque"]').first();
    if (await refInput.isVisible()) {
      await refInput.fill("HDFC-NEFT-984210");
      await page.waitForTimeout(400);
    }

    await spotlight("select:first-of-type, input[placeholder*='UTR']");
    await showKeyBadge("BANK REFERENCE", "Bank Transfer (NEFT/RTGS) · Audit UTR Transaction ID");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Save Payment Voucher & Immediate Ledger Reconciliation
  await playScene(4, async () => {
    const confirmBtn = page.locator('button:has-text("Confirm Payment")').first();
    if (await confirmBtn.isVisible()) {
      await spotlight('button:has-text("Confirm Payment")');
      await page.waitForTimeout(600);
      await confirmBtn.click();
      try {
        await page.waitForURL("**/dashboard/suppliers/**", { timeout: 8000 });
        await page.waitForTimeout(800);
      } catch (e) {
        console.log("Payment navigation handled");
      }
    }

    await spotlight(".card:has-text('Closing Balance'), .card, main");
    await showKeyBadge("LEDGER RECONCILED", "Closing Balance Deducted · Cash Book Journal Entry Posted");
    await page.waitForTimeout(2400);

    await clearSpotlight();
    await clearKeyBadge();
  });
};
