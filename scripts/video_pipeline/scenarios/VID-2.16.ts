import type { ScenarioRunner } from "./types";

export const runVID2_16: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  console.log("Loading Sales ledger for Customer Sale Returns scenario...");
  await page.goto(`${baseUrl}/dashboard/sales`);
  await page.waitForSelector("table.data-table tbody tr", { timeout: 10000 });
  await page.waitForTimeout(600);

  // Scene 1: Welcome & Overview of Customer Sale Returns
  await playScene(0, async () => {
    await spotlight('h1:has-text("Sales"), h1:has-text("Invoices")');
    await showKeyBadge("CUSTOMER SALE RETURNS", "Issue Statutory GST Credit Notes & Reclaim Batches");
    await page.waitForTimeout(2200);

    // Spotlight the sales list
    await spotlight("table.data-table tbody tr:first-child");
    await page.waitForTimeout(2000);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Open Invoice & Trigger Return Items (Alt + R)
  await playScene(1, async () => {
    // Open the invoice that has returnable items
    const viewLink = page
      .locator(
        'table.data-table tbody tr:has-text("INV/26-27/000009") a[href^="/dashboard/sales/"], table.data-table tbody tr:has-text("INV/26-27/000008") a[href^="/dashboard/sales/"], table.data-table tbody tr:not(:has-text("Cancelled")) a[href^="/dashboard/sales/"]'
      )
      .first();
    await spotlight('table.data-table tbody tr a[href^="/dashboard/sales/"]');
    await showKeyBadge("SELECT INVOICE", "Locate Billed Transaction to Initiate Return");
    await page.waitForTimeout(1000);

    await viewLink.click();
    await page.waitForSelector('a:has-text("Return Items")', { timeout: 8000 });
    await page.waitForTimeout(800);

    // Spotlight Return Items button
    const returnBtn = page.locator('a:has-text("Return Items")');
    await spotlight('a:has-text("Return Items")');
    await showKeyBadge("ALT + R · RETURN ITEMS", "Launch Guided Return & Credit Note Workflow");
    await page.waitForTimeout(1800);

    await returnBtn.click();
    await page.waitForSelector('form table.data-table', { timeout: 8000 });
    await page.waitForTimeout(600);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Partial Returns, Loose Tablets & Return Quantity Caps
  await playScene(2, async () => {
    await spotlight("form table.data-table");
    await showKeyBadge("PARTIAL STRIP & LOOSE TABLETS", "Strict Quantity Caps Enforced by Available Balance");
    await page.waitForTimeout(1500);

    // Fill return quantity in the first returnable row
    const packInput = page.locator('input[title*="Packs"], input[placeholder="0"]').first();
    if (await packInput.isVisible()) {
      await packInput.click();
      await packInput.fill("1");
      await page.waitForTimeout(800);
    }

    // Fill return reason
    const reasonInput = page.locator("#return-reason");
    await spotlight("#return-reason");
    await showKeyBadge("RETURN REASON", "Mandatory Statutory Reason Printed on GST Credit Note");
    await reasonInput.click();
    await reasonInput.fill("Patient requested dosage adjustment by physician.");
    await page.waitForTimeout(1800);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Automatic Batch Restoration & Expiry Quarantine
  await playScene(3, async () => {
    await spotlight(".lg\\:col-span-5.card, .card:has-text('Credit Note Summary')");
    await showKeyBadge("EXACT BATCH RESTORATION", "Automatic Quarantine Hold If Expired After Sale Date");
    await page.waitForTimeout(2200);

    // Spotlight the refund method choices
    await spotlight("div:has(> button:has-text('Cash'))");
    await showKeyBadge("REFUND TENDER", "Cash · UPI / QR · Card · Bank · Customer Ledger Khata");
    await page.waitForTimeout(2000);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Generate Sequential Credit Note & GSTR-1 Reporting
  await playScene(4, async () => {
    const submitBtn = page.locator('button:has-text("Issue Credit Note")');
    await spotlight('button:has-text("Issue Credit Note")');
    await showKeyBadge("ISSUE CREDIT NOTE", "Sequential Voucher Generation & GSTR-1 CDNR Return Filing");
    await page.waitForTimeout(1800);

    await submitBtn.click();
    await page.waitForSelector('#cn-printable, #printable-credit-note, #invoice-printable, a:has-text("Back to Invoice")', { timeout: 8000 });
    await page.waitForTimeout(1000);

    // Spotlight the generated credit note voucher
    await spotlight("#cn-printable, #printable-credit-note, #invoice-printable, .page");
    await showKeyBadge("CREDIT NOTE ISSUED", "Sequential CN Document Generated · Phase 2 Part 16 Complete");
    await page.waitForTimeout(2500);

    await clearSpotlight();
    await clearKeyBadge();
  });
};
