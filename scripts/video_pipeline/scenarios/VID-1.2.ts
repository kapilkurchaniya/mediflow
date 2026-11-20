import type { ScenarioRunner } from "./types";

export const runVID1_2: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  // Initial navigation to /dashboard (pre-authenticated)
  console.log("Loading dashboard overview...");
  await page.goto(`${baseUrl}/dashboard`);
  await page.waitForSelector('text=Today\'s Sales', { timeout: 10000 });
  await page.waitForTimeout(500);

  // Scene 1: 3-Zone Workspace Overview (Sidebar, Topbar, Central Canvas)
  await playScene(0, async () => {
    // Spotlight left navigation sidebar
    await spotlight("aside");
    await page.waitForTimeout(1400);
    await clearSpotlight();

    // Spotlight top action bar
    await spotlight("header");
    await page.waitForTimeout(1400);
    await clearSpotlight();
  });

  // Scene 2: Collapsible Sidebar & Keyboard Shortcut Ctrl+B
  await playScene(1, async () => {
    await showKeyBadge("Ctrl + B", "Collapse Sidebar");
    const toggleBtn = page.locator('button[aria-label="Toggle sidebar"]');
    
    // Collapse sidebar
    if (await toggleBtn.isVisible()) {
      await toggleBtn.hover();
      await page.waitForTimeout(400);
      await toggleBtn.click();
    } else {
      await page.keyboard.press("Control+b");
    }
    await page.waitForTimeout(1800);

    // Expand sidebar back
    await showKeyBadge("Ctrl + B", "Expand Sidebar");
    if (await toggleBtn.isVisible()) {
      await toggleBtn.hover();
      await page.waitForTimeout(400);
      await toggleBtn.click();
    } else {
      await page.keyboard.press("Control+b");
    }
    await page.waitForTimeout(1200);

    await clearKeyBadge();
  });

  // Scene 3: Top Navigation Bar & Action Controls (Breadcrumbs, Ctrl+K, F2)
  await playScene(2, async () => {
    await spotlight("header");
    await showKeyBadge("F2", "New POS Bill");
    await page.waitForTimeout(1000);

    const newBillBtn = page.locator('header a[href*="/sales/pos"]');
    if (await newBillBtn.isVisible()) {
      await newBillBtn.hover();
    }
    await page.waitForTimeout(1500);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Statutory Alerts & Notifications Popover
  await playScene(3, async () => {
    const notifBtn = page.locator('button[aria-label="Notifications"]');
    await spotlight('button[aria-label="Notifications"]');
    await page.waitForTimeout(800);

    // Open notifications popover
    await notifBtn.click();
    await page.waitForSelector("text=Near Expiry Alert", { timeout: 5000 });
    await page.waitForTimeout(2800);

    // Close notifications popover cleanly
    await notifBtn.click();
    await page.waitForTimeout(600);
    await clearSpotlight();
  });

  // Scene 5: Summary & Transition to Part 3 (Ctrl+K)
  await playScene(4, async () => {
    await showKeyBadge("Ctrl + K", "Command Palette");
    const searchTrigger = page.locator('header button[aria-label*="Search or type"]');
    if (await searchTrigger.isVisible()) {
      await searchTrigger.hover();
    }
    await page.waitForTimeout(1500);
  });

  // Final cleanup before recording finishes
  await clearKeyBadge();
  await clearSpotlight();
  await page.waitForTimeout(300);
};
