import type { ScenarioRunner } from "./types";

export const runVID1_3: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  // Initial navigation to /dashboard (pre-authenticated)
  console.log("Loading dashboard overview...");
  await page.goto(`${baseUrl}/dashboard`);
  await page.waitForSelector('text=Today\'s Sales', { timeout: 10000 });
  await page.waitForTimeout(500);

  // Scene 1: Topbar search trigger & introduction to Ctrl+K
  await playScene(0, async () => {
    const searchTrigger = page.locator('header button[aria-label*="Search or type"]');
    await spotlight('header button[aria-label*="Search or type"]');
    await showKeyBadge("Ctrl + K", "Command Palette");
    if (await searchTrigger.isVisible()) {
      await searchTrigger.hover();
    }
    await page.waitForTimeout(1400);
    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Opening the palette & typing 'batches' filter
  await playScene(1, async () => {
    // Open Command Palette via shortcut Ctrl+K
    await page.keyboard.press("Control+k");
    await page.waitForSelector('div[aria-label="Command Palette"]', { timeout: 5000 });
    await spotlight('div[aria-label="Command Palette"] > div');
    await page.waitForTimeout(600);

    // Target specifically the Command Palette search input
    const input = page.locator('div[aria-label="Command Palette"] input');
    await input.click();
    await input.fill("");
    await input.pressSequentially("batches", { delay: 85 });
    await page.waitForTimeout(1200);
  });

  // Scene 3: Keyboard Navigation & Jump to Module
  await playScene(2, async () => {
    await showKeyBadge("Enter", "Jump to Screen");
    await page.waitForTimeout(600);

    // Click the filtered 'Batches & stock' item or hit Enter
    const batchItem = page.locator('div[aria-label="Command Palette"] div:has-text("Batches & stock")').first();
    if (await batchItem.isVisible()) {
      await batchItem.click();
    } else {
      await page.keyboard.press("Enter");
    }

    await page.waitForURL("**/dashboard/inventory/batches**", { timeout: 10000 });
    await clearSpotlight();
    await clearKeyBadge();

    // Spotlight batches workspace card/table
    await page.waitForSelector(".card, table", { timeout: 8000 });
    await spotlight(".card");
    await page.waitForTimeout(1500);
    await clearSpotlight();
  });

  // Scene 4: Quick Actions & Shortcut Launching from any screen
  await playScene(3, async () => {
    // Press Ctrl+K again from batches screen
    await page.keyboard.press("Control+k");
    await page.waitForSelector('div[aria-label="Command Palette"]', { timeout: 5000 });
    await spotlight('div[aria-label="Command Palette"] > div');
    await page.waitForTimeout(500);

    const input = page.locator('div[aria-label="Command Palette"] input');
    await input.click();
    await input.fill("");
    await input.pressSequentially("shortcuts", { delay: 85 });
    await showKeyBadge("?", "Hotkeys Cheat Sheet");
    await page.waitForTimeout(2000);

    // Close cleanly via Escape
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Summary & Transition to Part 4 (7 Pharmacy Roles)
  await playScene(4, async () => {
    await showKeyBadge("PART 4", "7 Pharmacy Roles & RBAC");
    const userRoleArea = page.locator("aside").locator("text=Admin User").first();
    if (await userRoleArea.isVisible()) {
      await spotlight("aside");
    }
    await page.waitForTimeout(1500);
  });

  // Final cleanup before recording finishes
  await clearKeyBadge();
  await clearSpotlight();
  await page.waitForTimeout(300);
};
