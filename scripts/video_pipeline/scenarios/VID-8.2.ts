import type { ScenarioRunner } from "./types";

export const runVID8_2: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  console.log("Loading Customer Khata Receipts scenario...");
  await page.goto(`${baseUrl}/dashboard/accounting/receipts`);
  await page.waitForSelector('h1:has-text("Receipts"), .page-header', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Scene 1: Welcome & Credit Dues Overview
  await playScene(0, async () => {
    await spotlight("h1, .page-header");
    await showKeyBadge("CUSTOMER KHATA", "Settle Patient Credit Dues · FIFO Allocation · WhatsApp Receipts");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Select Customer with Outstanding Balance
  await playScene(1, async () => {
    const custItem = page.locator("ul.divide-y button").first();
    await spotlight(".card:has(ul.divide-y), .divide-y");
    await showKeyBadge("SELECT CUSTOMER", "Search by Name or Phone · Real-time Total Credit Due");
    await page.waitForTimeout(1000);

    if (await custItem.isVisible().catch(() => false)) {
      await custItem.click();
      await page.waitForTimeout(600);
    }

    await page.waitForTimeout(1400);
    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Payment Mode & UPI Reference
  await playScene(2, async () => {
    const refInput = page.locator('label:has-text("Reference") input, input[placeholder*="Ref"]').first();
    if (await refInput.isVisible().catch(() => false)) {
      await refInput.fill("UPI/629104829102");
      await page.waitForTimeout(400);
    }

    await spotlight(".card:has(table.data-table) .grid");
    await showKeyBadge("PAYMENT METHOD", "Cash · UPI · Card · Bank Transfer with Transaction Ref");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Bill-wise Settlement & Allocation
  await playScene(3, async () => {
    const payFullBtn = page.locator('button:has-text("Settle all bills in full"), button:has-text("Full")').first();
    if (await payFullBtn.isVisible().catch(() => false)) {
      await payFullBtn.click();
      await page.waitForTimeout(600);
    }

    await spotlight(".data-table, table, .overflow-x-auto");
    await showKeyBadge("FIFO SETTLEMENT", "Clear Invoices in Chronological Order · Partial or Full Payment");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Save Receipt & Audit Voucher
  await playScene(4, async () => {
    await spotlight('button:has-text("Record receipt"), .card:has(button:has-text("Record receipt"))');
    await showKeyBadge("RECEIPT ISSUED", "Direct General Ledger Post · Instant WhatsApp Confirmation");
    await page.waitForTimeout(2400);

    await clearSpotlight();
    await clearKeyBadge();
  });
};
