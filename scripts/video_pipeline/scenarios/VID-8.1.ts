import type { ScenarioRunner } from "./types";

export const runVID8_1: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  console.log("Loading Day Book & Balanced Journals scenario...");
  await page.goto(`${baseUrl}/dashboard/accounting`);
  await page.waitForSelector('h1:has-text("Accounting"), .page', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Scene 1: Welcome to Phase 8 & Double-Entry Engine Overview
  await playScene(0, async () => {
    await spotlight("h1, .page-header");
    await showKeyBadge("DOUBLE-ENTRY ENGINE", "Automated Vouchers · Real-time Debit & Credit Balance");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Day Book & Chronological Vouchers
  await playScene(1, async () => {
    await spotlight(".grid-cols-5, a[href*='trial-balance']");
    await showKeyBadge("ACCOUNTING DAY BOOK", "Chronological Audit Trail · Cash, Bank, Sales & Purchases");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Debit-Credit Balanced Enforcement
  await playScene(2, async () => {
    await spotlight("section.grid, .grid-cols-3");
    await showKeyBadge("BALANCED LEDGERS", "Total Debits = Total Credits · Zero Suspense Accounts");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Date Filter & Voucher Audit
  await playScene(3, async () => {
    const filterInput = page.locator("input[type='date'], select, button:has-text('Date')").first();
    if (await filterInput.isVisible()) {
      await spotlight("div.card.px-4.py-3");
      await page.waitForTimeout(600);
    } else {
      await spotlight("div.card.px-4.py-3");
    }

    await showKeyBadge("AUDIT & FILTER", "Custom Date Ranges · Receipts, Payments & Tax Vouchers");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Inspect Journal Lines & Next Part Preview
  await playScene(4, async () => {
    await spotlight(".xl\\:col-span-2, .xl\\:col-span-3, table.data-table");
    await showKeyBadge("JOURNAL AUDIT TRAILS", "Account Codes · Reference Numbers · Next: Customer Khata");
    await page.waitForTimeout(2400);

    await clearSpotlight();
    await clearKeyBadge();
  });
};
