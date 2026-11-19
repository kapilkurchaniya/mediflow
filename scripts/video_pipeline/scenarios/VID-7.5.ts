import type { ScenarioRunner } from "./types";

export const runVID7_5: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  console.log("Loading WhatsApp Live Inbox & Templates scenario...");
  await page.goto(`${baseUrl}/dashboard/whatsapp`);
  await page.waitForSelector('h1:has-text("WhatsApp"), .grid', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Scene 1: Welcome & Live Inbox Overview
  await playScene(0, async () => {
    await spotlight("h1, .grid");
    await showKeyBadge("WHATSAPP INBOX", "Unified Patient Communications · Prescription Consultations & Support");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Conversation Threads & Unread Counts
  await playScene(1, async () => {
    const firstThread = page.locator(".divide-y > button, .divide-y > div").first();
    if (await firstThread.isVisible()) {
      await firstThread.click();
      await page.waitForTimeout(400);
    }

    await spotlight(".lg\\:col-span-4, .bg-surface");
    await showKeyBadge("PATIENT THREADS", "Search Chats by Name/Phone · Unread Message Counters · Timestamps");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Two-Way Chat & Prescription Review
  await playScene(2, async () => {
    const replyInput = page.locator("input[placeholder*='Type a message']").first();
    if (await replyInput.isVisible()) {
      await replyInput.fill("Thank you! The delivery rider has dispatched your medicines.");
      await page.waitForTimeout(400);
    }

    await spotlight(".lg\\:col-span-8, form");
    await showKeyBadge("REAL-TIME CHAT", "Pharmacist Consultations · Dosage Guidance · Prescription Image Check");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Pre-Approved Meta HSM Templates Portal
  await playScene(3, async () => {
    const templatesLink = page.locator("a[href*='/dashboard/whatsapp/templates'], a:has-text('Templates')").first();
    if (await templatesLink.isVisible()) {
      await spotlight("a[href*='/dashboard/whatsapp/templates'], a:has-text('Templates')");
      await page.waitForTimeout(600);
      await templatesLink.click();
      await page.waitForSelector("h1, .grid, .card, table", { timeout: 10000 });
      await page.waitForTimeout(600);
    }

    await spotlight(".grid, table, .card");
    await showKeyBadge("TRANSACTIONAL TEMPLATES", "Meta HSM Compliant · Refill Reminders · Order Ready & Invoices");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Dynamic Variable Insertion & Complete Phase 7
  await playScene(4, async () => {
    await spotlight(".grid, table, .card");
    await showKeyBadge("AUTOMATED DISPATCH", "Instant Delivery Status · Concludes Phase 7 Suite");
    await page.waitForTimeout(2400);

    await clearSpotlight();
    await clearKeyBadge();
  });
};
