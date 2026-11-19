import type { ScenarioRunner } from "./types";

export const runVID7_3: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  console.log("Loading Chronic Patient Refill & Follow-Up Reminders scenario...");
  await page.goto(`${baseUrl}/dashboard/reminders`);
  await page.waitForSelector('h1:has-text("Reminders"), button:has-text("Schedule Reminder")', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Scene 1: Welcome & Reminders Dashboard Overview
  await playScene(0, async () => {
    await spotlight("h1, .space-y-6");
    await showKeyBadge("PATIENT REMINDERS", "Chronic Care Adherence · Automated Refill & Follow-Up Alerts");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Filter Reminders & Due Summary
  await playScene(1, async () => {
    const pendingFilter = page.locator("button:has-text('pending')").first();
    if (await pendingFilter.isVisible()) {
      await pendingFilter.click();
      await page.waitForTimeout(400);
    }

    const allFilter = page.locator("button:has-text('all')").first();
    if (await allFilter.isVisible()) {
      await allFilter.click();
      await page.waitForTimeout(400);
    }

    await spotlight("table, .flex:has(> button)");
    await showKeyBadge("REMINDER SCHEDULE", "Track Scheduled Dates · Medicine Names · Delivery Channels");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Schedule New Refill Reminder
  await playScene(2, async () => {
    const scheduleBtn = page.locator('button:has-text("Schedule Reminder")').first();
    if (await scheduleBtn.isVisible()) {
      await spotlight('button:has-text("Schedule Reminder")');
      await page.waitForTimeout(600);
      await scheduleBtn.click();
      await page.waitForTimeout(600);
    }

    const nameInput = page.locator(".fixed input[name='customerName']").first();
    if (await nameInput.isVisible()) {
      await nameInput.fill("Suresh Verma");
    }

    const phoneInput = page.locator(".fixed input[name='customerPhone']").first();
    if (await phoneInput.isVisible()) {
      await phoneInput.fill("98201 99887");
    }

    const medSelect = page.locator(".fixed select[name='medicineId']").first();
    if (await medSelect.isVisible()) {
      const options = await medSelect.locator("option").all();
      if (options.length > 1) {
        await medSelect.selectOption({ index: 1 });
      }
    }

    await spotlight(".fixed.inset-0, .bg-surface");
    await showKeyBadge("CHRONIC PATIENT", "Name · Contact Phone · Maintenance Medicine Prescription");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Configure Target Date & WhatsApp Channel
  await playScene(3, async () => {
    const channelSelect = page.locator(".fixed select[name='channel']").first();
    if (await channelSelect.isVisible()) {
      await channelSelect.selectOption("whatsapp");
    }

    const dateInput = page.locator(".fixed input[name='scheduledDate']").first();
    if (await dateInput.isVisible()) {
      await dateInput.fill("2026-11-15");
    }

    const msgInput = page.locator(".fixed textarea[name='message']").first();
    if (await msgInput.isVisible()) {
      await msgInput.fill("Dear Suresh, your Augmentin 625 course is due for refill. Reply YES on WhatsApp to reserve your pack.");
    }

    await spotlight(".fixed.inset-0, .bg-surface");
    await showKeyBadge("WHATSAPP NOTIFICATION", "Target Due Date · Personalized Message with 1-Click WhatsApp Order");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Save Schedule & Immediate Batch Trigger
  await playScene(4, async () => {
    const submitBtn = page.locator('button[type="submit"]:has-text("Save Reminder")').first();
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
      await page.waitForTimeout(800);
    }

    const processBtn = page.locator('button:has-text("Dispatch Due")').first();
    if (await processBtn.isVisible()) {
      await spotlight('button:has-text("Dispatch Due")');
    }

    await showKeyBadge("DISPATCH AUTOMATION", "Scheduled Alert Active · Automated Daily Cron or Immediate Manual Trigger");
    await page.waitForTimeout(2400);

    await clearSpotlight();
    await clearKeyBadge();
  });
};
