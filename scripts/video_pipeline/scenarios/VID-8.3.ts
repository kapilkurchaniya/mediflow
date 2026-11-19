import type { ScenarioRunner } from "./types";

export const runVID8_3: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  console.log("Loading Financial Statements scenario...");
  await page.goto(`${baseUrl}/dashboard/accounting/trial-balance`);
  await page.waitForSelector('h1:has-text("Trial Balance"), h1, .page', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Scene 1: Welcome & Real-Time Financial Statements Overview
  await playScene(0, async () => {
    await spotlight("h1, .page-header, header");
    await showKeyBadge("FINANCIAL STATEMENTS", "Real-Time Statutory Statements · Auto-Compiled from POS & Purchases");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Trial Balance Ledger Positions
  await playScene(1, async () => {
    await spotlight("table, .card, .grid");
    await showKeyBadge("TRIAL BALANCE", "Multi-Column Ledger Summary · Verified Debit-Credit Balancing");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Profit & Loss Statement (P&L)
  await playScene(2, async () => {
    await page.goto(`${baseUrl}/dashboard/accounting/profit-loss`);
    await page.waitForSelector('h1:has-text("Profit"), h1, table, .page', { timeout: 10000 });
    await page.waitForTimeout(600);

    await spotlight("table, .card, .grid");
    await showKeyBadge("PROFIT & LOSS", "Revenue · Cost of Goods Sold (COGS) · Gross Margin & Net Profit");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Balance Sheet Capital Structure
  await playScene(3, async () => {
    await page.goto(`${baseUrl}/dashboard/accounting/balance-sheet`);
    await page.waitForSelector('h1:has-text("Balance Sheet"), h1, table, .page', { timeout: 10000 });
    await page.waitForTimeout(600);

    await spotlight("table, .card, .grid");
    await showKeyBadge("BALANCE SHEET", "Assets (Cash, Inventory, Debtors) · Liabilities & Net Worth");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Export for CA & Preview Part 4
  await playScene(4, async () => {
    const exportBtn = page.locator("button:has-text('Export'), button:has-text('Print'), a:has-text('Export')").first();
    if (await exportBtn.isVisible().catch(() => false)) {
      await spotlight("button:has-text('Export'), button:has-text('Print'), a:has-text('Export')");
    } else {
      await spotlight("table, .card, .grid");
    }

    await showKeyBadge("AUDIT COMPLIANCE", "CA-Ready Exports · Statutory Year-End Filing · Next: Ageing Buckets");
    await page.waitForTimeout(2400);

    await clearSpotlight();
    await clearKeyBadge();
  });
};
