import type { ScenarioRunner } from "./types";

export const runVID7_2: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  console.log("Loading Promise Orders Fulfillment scenario...");
  await page.goto(`${baseUrl}/dashboard/sales/promise-orders`);
  await page.waitForSelector('h1:has-text("Promise Orders"), .space-y-4', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Scene 1: Welcome & Promise Orders Backorder Management
  await playScene(0, async () => {
    await spotlight("h1, table");
    await showKeyBadge("PROMISE ORDERS", "Out-of-Stock Commitments · Supplier Arrival Fulfillments");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Filter Pending Commitments
  await playScene(1, async () => {
    const pendingTab = page.locator("button:has-text('Pending')").first();
    if (await pendingTab.isVisible()) {
      await pendingTab.click();
      await page.waitForTimeout(600);
    }

    await spotlight("table, .flex:has(> button)");
    await showKeyBadge("PATIENT BACKORDERS", "Customer Phone · Promised Target Date · Requested Pack Qty");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Match Inward GRN Delivery to Order
  await playScene(2, async () => {
    await spotlight("table tbody tr:first-child");
    await showKeyBadge("STOCK ALLOCATED", "Inward GRN Automatically Links Received Lots to Pending Patient Backorders");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Notify Customer via WhatsApp
  await playScene(3, async () => {
    await spotlight("table tbody tr:first-child td:nth-child(2), table tbody tr:first-child td:nth-child(5)");
    await showKeyBadge("WHATSAPP NOTIFICATION", "Automated Alert: 'Your Ordered Medicine Has Arrived & Is Ready for Collection'");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Mark Fulfilled & Settle POS Bill
  await playScene(4, async () => {
    const fulfillBtn = page.locator("table tbody tr:first-child button:has-text('Fulfill'), table tbody tr:first-child button:has-text('Mark')").first();
    if (await fulfillBtn.isVisible()) {
      await spotlight("table tbody tr:first-child button");
      await page.waitForTimeout(600);
      await fulfillBtn.click();
      await page.waitForTimeout(800);
    }

    await spotlight("table");
    await showKeyBadge("ORDER CLOSED", "Advance Settled · Transferred to Active Dispensing Invoice");
    await page.waitForTimeout(2400);

    await clearSpotlight();
    await clearKeyBadge();
  });
};
