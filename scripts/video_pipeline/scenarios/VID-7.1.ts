import type { ScenarioRunner } from "./types";

export const runVID7_1: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  console.log("Loading Omnichannel Orders Pipeline scenario...");
  await page.goto(`${baseUrl}/dashboard/orders`);
  await page.waitForSelector('h1:has-text("Orders"), .space-y-6', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Scene 1: Welcome & Pipeline Overview
  await playScene(0, async () => {
    await spotlight("h1, .space-y-6");
    await showKeyBadge("OMNICHANNEL ORDERS", "Unified Inward Pipeline · WhatsApp · Mobile App & Phone Orders");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Filter Pipeline Stages
  await playScene(1, async () => {
    const preparingTab = page.locator("button:has-text('preparing')").first();
    if (await preparingTab.isVisible()) {
      await preparingTab.click();
      await page.waitForTimeout(600);
    }

    const readyTab = page.locator("button:has-text('ready')").first();
    if (await readyTab.isVisible()) {
      await readyTab.click();
      await page.waitForTimeout(600);
    }

    const allTab = page.locator("button:has-text('all')").first();
    if (await allTab.isVisible()) {
      await allTab.click();
      await page.waitForTimeout(600);
    }

    await spotlight(".overflow-x-auto, button.btn-primary");
    await showKeyBadge("FULFILLMENT STAGES", "Received → Preparing → Ready for Pickup → Delivered");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Origin Badges (WhatsApp, eRetail, Phone)
  await playScene(2, async () => {
    await spotlight(".badge:has-text('WhatsApp'), .badge:has-text('eRetail'), .badge:has-text('Phone')");
    await showKeyBadge("CHANNEL ORIGIN BADGES", "Instant Channel Visibility: WhatsApp Chats · eRetail Cart · Calls");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Advance Order Status
  await playScene(3, async () => {
    const advanceBtn = page.locator('button:has-text("Accept & Prepare"), button:has-text("Mark Ready")').first();
    if (await advanceBtn.isVisible()) {
      await spotlight('button:has-text("Accept & Prepare"), button:has-text("Mark Ready")');
      await page.waitForTimeout(600);
      await advanceBtn.click();
      await page.waitForTimeout(600);
    } else {
      await spotlight(".card:first-child");
    }

    await showKeyBadge("DISPENSARY PROGRESSION", "Dispatched to Packing → Ready for Counter Pickup or Courier");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Complete Handover & POS Invoicing
  await playScene(4, async () => {
    const deliverBtn = page.locator('button:has-text("Mark Delivered"), a:has-text("View Details")').first();
    if (await deliverBtn.isVisible()) {
      await spotlight('button:has-text("Mark Delivered"), a:has-text("View Details")');
    }
    await showKeyBadge("ORDER FULFILLED", "Convert Directly into Counter Tax Invoice or Mark Delivered");
    await page.waitForTimeout(2400);

    await clearSpotlight();
    await clearKeyBadge();
  });
};
