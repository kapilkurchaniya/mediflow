import type { ScenarioRunner } from "./types";

export const runVID2_17: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  console.log("Loading Cash Register & Shifts scenario...");
  await page.goto(`${baseUrl}/dashboard/sales/register`);
  await page.waitForSelector('h1:has-text("Cash register"), h1', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Scene 1: Welcome & Overview of Register Controls
  await playScene(0, async () => {
    await spotlight('h1:has-text("Cash register"), h1');
    await showKeyBadge("CASH REGISTER & SHIFTS", "Drawer Audits · Elimination of Cash Discrepancies");
    await page.waitForTimeout(2000);

    // Spotlight the shift control banner
    await spotlight(".bg-white.rounded-2xl, .bg-white.p-6, .page > div");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Open Register & Opening Cash Float (F4)
  await playScene(1, async () => {
    const openBtn = page.locator('button:has-text("Open Register")');
    if (await openBtn.isVisible()) {
      await spotlight('button:has-text("Open Register")');
      await showKeyBadge("F4 · OPEN REGISTER", "Specify Starting Float Tally to Unlock Counter");
      await page.waitForTimeout(1400);

      await openBtn.click();
      await page.waitForSelector(".fixed.inset-0", { timeout: 6000 });
      await page.waitForTimeout(600);

      // Spotlight the opening denomination inputs
      await spotlight(".fixed.inset-0 .bg-white");
      await page.waitForTimeout(1600);

      // Click Confirm & Open Register
      const confirmOpenBtn = page.locator('.fixed.inset-0 button:has-text("Confirm & Open Register")');
      await confirmOpenBtn.click();
      await page.waitForTimeout(800);

      // Reload register page to load server-rendered active shift
      await page.goto(`${baseUrl}/dashboard/sales/register`);
      await page.waitForSelector('a:has-text("X-Report")', { timeout: 8000 });
      await page.waitForTimeout(600);
    } else {
      await spotlight(".bg-white.rounded-2xl, .bg-white.p-6");
      await showKeyBadge("REGISTER ACTIVE", "Cashier Shift Currently Unlocked");
      await page.waitForTimeout(2000);
    }

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Expected Cash Continuous Formula
  await playScene(2, async () => {
    // Spotlight the 4 KPI Drawer Balance Cards
    await spotlight(".grid.grid-cols-1.sm\\:grid-cols-2.lg\\:grid-cols-4");
    await showKeyBadge("DRAWER CASH FORMULA", "Starting Float + Cash Collections - Cash Returns");
    await page.waitForTimeout(2600);

    // Spotlight the Expected Cash card specifically
    const expectedCard = page.locator('div:has-text("Expected Drawer Cash")').first();
    if (await expectedCard.isVisible()) {
      await spotlight('div:has-text("Expected Drawer Cash")');
      await page.waitForTimeout(1800);
    }

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Mid-Shift X-Report Thermal Slip (Alt + P)
  await playScene(3, async () => {
    const xReportBtn = page.locator('a:has-text("X-Report")').first();
    await spotlight('a:has-text("X-Report")');
    await showKeyBadge("ALT + P · X-REPORT", "Interim Non-Closing Snapshot for Manager Audits");
    await page.waitForTimeout(1200);

    await xReportBtn.click();
    await page.waitForSelector('#report-printable, a:has-text("Back to Cash Register")', { timeout: 8000 });
    await page.waitForTimeout(1000);

    // Spotlight X-Report print layout
    await spotlight("#report-printable, .page");
    await showKeyBadge("X-REPORT THERMAL SLIP", "Current Cash In Till · Live Net Sales · Safe For Spot-Checks");
    await page.waitForTimeout(2200);

    // Navigate back to register
    await page.goto(`${baseUrl}/dashboard/sales/register`);
    await page.waitForSelector('h1:has-text("Cash register"), h1', { timeout: 8000 });
    await page.waitForTimeout(600);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Close Register, Denominations & Closing Z-Report
  await playScene(4, async () => {
    const closeBtn = page.locator('button:has-text("Close Register")');
    await spotlight('button:has-text("Close Register")');
    await showKeyBadge("F8 · CLOSE REGISTER", "Handover Denomination Tally & Lock Shift (Z-Report)");
    await page.waitForTimeout(1400);

    await closeBtn.click();
    await page.waitForSelector(".fixed.inset-0", { timeout: 6000 });
    await page.waitForTimeout(600);

    // Spotlight denomination counter modal
    await spotlight(".fixed.inset-0 .bg-white");
    await page.waitForTimeout(1400);

    // Click Confirm & Lock Shift
    const lockBtn = page.locator('.fixed.inset-0 button:has-text("Confirm & Lock Shift")');
    await lockBtn.click();
    await page.waitForSelector('#report-printable, a:has-text("Back to Cash Register")', { timeout: 8000 });
    await page.waitForTimeout(1000);

    // Spotlight the final Z-Report
    await spotlight("#report-printable, .page");
    await showKeyBadge("CLOSING Z-REPORT", "Official Sign-Off Slip · Variance Stamped in Immutable Audit Log");
    await page.waitForTimeout(2600);

    await clearSpotlight();
    await clearKeyBadge();
  });
};
