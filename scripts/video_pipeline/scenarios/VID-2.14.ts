import type { ScenarioRunner } from "./types";

export const runVID2_14: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  // Navigate to Sales Ledger to locate completed counter bill
  console.log("Loading Sales ledger for Invoice Printing scenario...");
  await page.goto(`${baseUrl}/dashboard/sales`);
  await page.waitForSelector('table.data-table tbody tr', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Scene 1: Welcome & Overview of Invoice Printing
  await playScene(0, async () => {
    await spotlight('h1:has-text("Sales"), h1:has-text("Invoices")');
    await showKeyBadge("INVOICE PRINTING", "Thermal 80mm Counter Slip & Formal A4 Tax Invoice");
    await page.waitForTimeout(2000);

    // Spotlight the first sales transaction row
    await spotlight("table.data-table tbody tr:first-child");
    await page.waitForTimeout(2000);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Open Print Preview Page
  await playScene(1, async () => {
    const printLink = page.locator('table.data-table tbody tr:first-child a[href*="/print"]').first();
    await spotlight('table.data-table tbody tr:first-child a[href*="/print"]');
    await showKeyBadge("PRINT PREVIEW", "Open Dedicated Invoice Layout View");
    await page.waitForTimeout(1000);

    await printLink.click();
    await page.waitForSelector("#invoice-printable", { timeout: 8000 });
    await page.waitForTimeout(800);

    // Spotlight the top format selection bar
    await spotlight("div:has(> a:has-text('80mm Thermal Slip'))");
    await showKeyBadge("DUAL FORMAT TOGGLE", "80mm Thermal Roll · Full A4 GST Tax Invoice");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Examine 80mm Thermal POS Slip Format
  await playScene(2, async () => {
    await spotlight("#invoice-printable");
    await showKeyBadge("80MM THERMAL SLIP", "TVS & Epson Ready · DL, GSTIN, Batches & Totals");
    await page.waitForTimeout(2600);

    // Scroll slightly down to show itemized table and payment tender
    await page.evaluate(() => window.scrollBy({ top: 180, behavior: "smooth" }));
    await page.waitForTimeout(1800);

    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    await page.waitForTimeout(600);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Switch to Full A4 GST Tax Invoice
  await playScene(3, async () => {
    const a4Toggle = page.locator('a:has-text("Full A4 GST Invoice")');
    await spotlight('a:has-text("Full A4 GST Invoice")');
    await showKeyBadge("A4 GST TAX INVOICE", "Statutory Rule 46 Format with Full HSN Breakdown");
    await page.waitForTimeout(1000);

    await a4Toggle.click();
    await page.waitForSelector("#invoice-printable", { timeout: 6000 });
    await page.waitForTimeout(800);

    // Spotlight the A4 formatted document
    await spotlight("#invoice-printable");
    await showKeyBadge("STATUTORY COMPLIANCE", "CGST, SGST, Batch Expiry & Authorized Signatory");
    await page.waitForTimeout(2800);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Print Button & Phase 2 Wrap-Up
  await playScene(4, async () => {
    const printBtn = page.locator('button:has-text("Print Invoice")');
    await spotlight('button:has-text("Print Invoice")');
    await showKeyBadge("ONE-CLICK PRINT", "Instant Thermal & Deskjet Spooling · Phase 2 Complete!");
    await page.waitForTimeout(2600);

    await clearSpotlight();
    await clearKeyBadge();
  });
};
