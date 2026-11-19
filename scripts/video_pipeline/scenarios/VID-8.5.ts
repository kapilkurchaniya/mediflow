import type { ScenarioRunner } from "./types";

export const runVID8_5: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  console.log("Loading Bank Reconciliation scenario...");
  await page.goto(`${baseUrl}/dashboard/accounting/bank-reconciliation`);
  await page.waitForSelector('h1:has-text("Bank"), h1, .page', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Scene 1: Welcome & Overview of Bank Reconciliation
  await playScene(0, async () => {
    await spotlight("h1, .page-header, .page > div:first-child");
    await showKeyBadge("BANK RECONCILIATION", "Electronic Statement Matching · UPI/Card Settlements · Book Balances");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Current Account & Books vs Bank Summary
  await playScene(1, async () => {
    await spotlight(".grid-cols-4, .card, .grid");
    await showKeyBadge("ACCOUNT SUMMARY", "Match Progress · Cleared Credits & Debits · Pending Discrepancies");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Upload CSV Statement Modal
  await playScene(2, async () => {
    const uploadBtn = page.locator("button:has-text('Upload Statement CSV')").first();
    if (await uploadBtn.isVisible().catch(() => false)) {
      await spotlight("button:has-text('Upload Statement CSV')");
      await page.waitForTimeout(600);
      await uploadBtn.click();
      await page.waitForSelector("form, .bg-surface, h3:has-text('Upload Bank Statement CSV')", { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(600);
      await spotlight("form, .bg-surface, .fixed.inset-0");
    } else {
      await spotlight(".card, table");
    }

    await showKeyBadge("CSV STATEMENT UPLOAD", "Auto-Parses Dates · Bank UTR Numbers · Credits & Debits");
    await page.waitForTimeout(2200);

    // Close modal if open
    const closeBtn = page.locator("button:has-text('Cancel'), button:has-text('Close')").first();
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click();
      await page.waitForTimeout(400);
    }

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Intelligent Auto-Match Engine
  await playScene(3, async () => {
    await spotlight("button:has-text('Auto Match'), table, .card");
    await showKeyBadge("AUTO-MATCH ENGINE", "One-Click Matching · UTR Reference Linking · Exact Value Pairing");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Confirm Matches & Conclude Phase 8
  await playScene(4, async () => {
    await spotlight("table, .card, .grid");
    await showKeyBadge("AUDIT CLEARANCE", "Immutable Bank Ledger Lock · Concludes Phase 8 Accounting Suite");
    await page.waitForTimeout(2400);

    await clearSpotlight();
    await clearKeyBadge();
  });
};
