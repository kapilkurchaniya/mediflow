import type { ScenarioRunner } from "./types";

export const runVID2_15: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  console.log("Loading Sales ledger for Same-Day Bill Cancellation scenario...");
  await page.goto(`${baseUrl}/dashboard/sales`);
  await page.waitForSelector("table.data-table tbody tr", { timeout: 10000 });
  await page.waitForTimeout(600);

  // Scene 1: Welcome & Overview of Same-Day Bill Cancellation
  await playScene(0, async () => {
    await spotlight('h1:has-text("Sales"), h1:has-text("Invoices")');
    await showKeyBadge("SAME-DAY BILL CANCELLATION", "Manager Authorization & Audit Integrity");
    await page.waitForTimeout(2200);

    // Spotlight the first completed sales transaction row
    await spotlight("table.data-table tbody tr:first-child");
    await page.waitForTimeout(2000);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Open Invoice & Trigger Cancel Bill (Alt + C)
  await playScene(1, async () => {
    const viewLink = page.locator('table.data-table tbody tr:first-child a[href^="/dashboard/sales/"]').first();
    await spotlight('table.data-table tbody tr:first-child a[href^="/dashboard/sales/"]');
    await showKeyBadge("SELECT INVOICE", "Open Bill Details & Audit Inspector View");
    await page.waitForTimeout(1000);

    await viewLink.click();
    await page.waitForSelector('button:has-text("Cancel Bill")', { timeout: 8000 });
    await page.waitForTimeout(800);

    // Spotlight Cancel Bill button
    const cancelBtn = page.locator('button:has-text("Cancel Bill")');
    await spotlight('button:has-text("Cancel Bill")');
    await showKeyBadge("ALT + C · CANCEL BILL", "Open Statutory Same-Day Cancellation Dialog");
    await page.waitForTimeout(1800);

    await cancelBtn.click();
    await page.waitForSelector('div[role="dialog"]', { timeout: 6000 });
    await page.waitForTimeout(600);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Same-Day IST Midnight Cutoff & Mandatory Reason
  await playScene(2, async () => {
    await spotlight('div[role="dialog"]');
    await showKeyBadge("MANDATORY AUDIT REASON", "Statutory Cutoff: Same Calendar Day Before Midnight IST");
    await page.waitForTimeout(1200);

    const textarea = page.locator('div[role="dialog"] textarea');
    await textarea.click();
    await textarea.fill("Patient prescription dosage altered by consulting physician; cancelled per manager authorization.");
    await page.waitForTimeout(2000);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Automated Batch Restoration & Reversing Double-Entry
  await playScene(3, async () => {
    const confirmBtn = page.locator('div[role="dialog"] button:has-text("Confirm Cancellation")');
    await spotlight('div[role="dialog"] button:has-text("Confirm Cancellation")');
    await showKeyBadge("CONFIRM CANCELLATION", "Automatic Exact Batch Return & Reversing Journal Voucher");
    await page.waitForTimeout(1600);

    await confirmBtn.click();
    await page.waitForSelector(".badge-danger:has-text('Cancelled'), span:has-text('Cancelled')", { timeout: 8000 });
    await page.waitForTimeout(800);

    // Spotlight the prominent cancellation alert banner
    await spotlight("div:has(> div:has-text('This sale invoice has been cancelled'))");
    await showKeyBadge("STATUS: CANCELLED", "Stock Restored to Shelf · Outward GST Voided · Reversal Stamped");
    await page.waitForTimeout(2500);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Permanent Drug Dispensing Logs & Phase 2 Wrap-Up
  await playScene(4, async () => {
    await spotlight("div:has(> div:has-text('This sale invoice has been cancelled')) p");
    await showKeyBadge("STATUTORY DRUG LOGS", "Permanent Dispensing Trail Preserved with Indelible Timestamps");
    await page.waitForTimeout(2800);

    await clearSpotlight();
    await clearKeyBadge();
  });
};
