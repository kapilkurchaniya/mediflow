import type { ScenarioRunner } from "./types";

export const runVID1_1: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  // Initial navigation to /login
  console.log("Loading login screen...");
  await page.goto(`${baseUrl}/login`);
  await page.waitForSelector('input[name="email"]', { timeout: 10000 });
  await page.waitForTimeout(500);

  // Scene 1: Welcome to MediFlow & sign-in overview
  await playScene(0, async () => {
    await showKeyBadge("SECURE", "Pharmacy Authentication");
    await spotlight(".bg-white.rounded-3xl");
    await page.waitForTimeout(1000);
    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Individual staff credentials for audit trails
  await playScene(1, async () => {
    await showKeyBadge("USER ID", "Statutory Audit Trail");
    
    // Type email
    const emailInput = page.locator('input[name="email"]');
    await emailInput.click();
    await emailInput.fill("");
    await emailInput.pressSequentially("admin@apollo.com", { delay: 65 });
    await page.waitForTimeout(300);

    // Type password
    const passwordInput = page.locator('input[name="password"]');
    await passwordInput.click();
    await passwordInput.fill("");
    await passwordInput.pressSequentially("admin123", { delay: 65 });
    await page.waitForTimeout(300);

    await clearKeyBadge();
  });

  // Scene 3: Click Sign In & launch live dashboard
  await playScene(2, async () => {
    const submitBtn = page.locator('button[type="submit"]');
    await spotlight('button[type="submit"]');
    await page.waitForTimeout(400);
    await submitBtn.click();

    // Wait for navigation and dashboard metrics
    await page.waitForURL("**/dashboard**", { timeout: 10000 });
    await clearSpotlight();
    await page.waitForSelector('text=Today\'s Sales', { timeout: 10000 });
    await page.waitForTimeout(800);
  });

  // Scene 4: Branch Details & Multi-outlet Switcher
  await playScene(3, async () => {
    const branchBtn = page.locator('aside button:has-text("Main branch")');
    await spotlight('aside button:has-text("Main branch")');
    await page.waitForTimeout(700);

    // Click to open branch details dropdown
    await branchBtn.click();
    await page.waitForSelector('text=Branch Details', { timeout: 5000 });
    await page.waitForTimeout(1800);

    // Close branch details dropdown cleanly
    const closeBtn = page.locator('button:has-text("Close")');
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
    } else {
      await branchBtn.click();
    }
    await clearSpotlight();
  });

  // Scene 5: Ready to work & intro to Ctrl+B in Part 2
  await playScene(4, async () => {
    await showKeyBadge("Ctrl + B", "Toggle Sidebar");
    const toggleBtn = page.locator('button[aria-label="Toggle sidebar"]');
    if (await toggleBtn.isVisible()) {
      await toggleBtn.hover();
    }
    await page.waitForTimeout(1000);
  });

  // Final cleanup before recording finishes
  await clearKeyBadge();
  await clearSpotlight();
  await page.waitForTimeout(300);
};
