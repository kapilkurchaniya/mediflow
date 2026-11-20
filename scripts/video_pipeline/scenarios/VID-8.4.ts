import type { ScenarioRunner } from "./types";

export const runVID8_4: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  console.log("Loading Outstanding Ageing scenario...");
  await page.goto(`${baseUrl}/dashboard/accounting/outstanding`);
  await page.waitForSelector('h1:has-text("Receivables"), h1, .page, table', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Scene 1: Welcome & Working Capital Overview
  await playScene(0, async () => {
    await spotlight("h1, .page-header, header");
    await showKeyBadge("WORKING CAPITAL", "Ageing Analysis · Debtors & Creditors Tracking · Cash Flow Health");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: 30-60-90+ Day Ageing Buckets
  await playScene(1, async () => {
    await spotlight(".grid-cols-4, .kpi-row, .grid");
    await showKeyBadge("AGEING BUCKETS", "0-30 Days · 31-60 Days · 61-90 Days · 90+ Days Overdue");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Customer Debtors & Overdue Follow-ups
  await playScene(2, async () => {
    await spotlight("table, .data-table, .card");
    await showKeyBadge("CUSTOMER DEBTORS", "Identify Chronic Overdues · Patient Credit Exposure · Risk Mitigation");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Switch to Supplier Payables
  await playScene(3, async () => {
    const payablesTab = page.locator("a[href*='type=payable']").first();
    if (await payablesTab.isVisible().catch(() => false)) {
      await spotlight("a[href*='type=payable']");
      await page.waitForTimeout(600);
      await payablesTab.click();
      await page.waitForTimeout(800);
    }

    await spotlight("table, .data-table, .card");
    await showKeyBadge("SUPPLIER PAYABLES", "Distributor Credit Terms · Cash Discount Windows · Payables Ageing");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Action Reminders & Next Preview
  await playScene(4, async () => {
    await spotlight("table, .data-table, .card");
    await showKeyBadge("CASH FLOW CONTROL", "Targeted WhatsApp Reminders · Next: Bank Statement Reconciliation");
    await page.waitForTimeout(2400);

    await clearSpotlight();
    await clearKeyBadge();
  });
};
