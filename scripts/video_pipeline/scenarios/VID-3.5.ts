import type { ScenarioRunner } from "./types";

export const runVID3_5: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  console.log("Loading Statutory Drug Registers scenario...");
  await page.goto(`${baseUrl}/dashboard/compliance`);
  await page.waitForSelector('h1:has-text("Drug Dispensing Registers")', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Scene 1: Introduction to Statutory Compliance & Registers
  await playScene(0, async () => {
    await spotlight('h1:has-text("Drug Dispensing Registers")');
    await showKeyBadge("STATUTORY COMPLIANCE", "Drugs & Cosmetics Act · Immutable Dispensing Logs");
    await page.waitForTimeout(2000);

    const stats = page.locator(".grid.grid-cols-2").first();
    if (await stats.isVisible()) {
      await spotlight(".grid.grid-cols-2");
    }
    await page.waitForTimeout(1800);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Schedule H1 Register (Form 35) & 3-Year Lock
  await playScene(1, async () => {
    const h1Tab = page.locator('button:has-text("Schedule H1 Register")');
    await h1Tab.click();
    await page.waitForTimeout(600);

    // Spotlight the banner and active tab
    const banner = page.locator(".bg-rose-50\\/70");
    if (await banner.isVisible()) {
      await spotlight(".bg-rose-50\\/70");
    } else {
      await spotlight('button:has-text("Schedule H1 Register")');
    }
    await showKeyBadge("FORM 35 (SCHEDULE H1)", "Rule 65 Compliance · 3-Year Audit Retention Required");
    await page.waitForTimeout(2400);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Schedule H Prescription Register
  await playScene(2, async () => {
    const hTab = page.locator('button:has-text("Schedule H Register")');
    await hTab.click();
    await page.waitForTimeout(600);

    // Spotlight table
    const table = page.locator(".overflow-x-auto table");
    if (await table.isVisible()) {
      await spotlight(".overflow-x-auto table");
    } else {
      await spotlight('button:has-text("Schedule H Register")');
    }
    await showKeyBadge("SCHEDULE H REGISTER", "Doctor Credentials, Patient Identity & Quantities");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: NDPS Narcotics & Schedule X Psychotropics
  await playScene(3, async () => {
    const ndpsTab = page.locator('button:has-text("NDPS Narcotics")');
    await ndpsTab.click();
    await page.waitForTimeout(600);

    await spotlight('button:has-text("NDPS Narcotics")');
    await showKeyBadge("NDPS NARCOTICS", "Strict Chain-of-Custody · Controlled Substance Tracking");
    await page.waitForTimeout(1400);

    const xTab = page.locator('button:has-text("Schedule X")');
    await xTab.click();
    await page.waitForTimeout(600);

    await spotlight('button:has-text("Schedule X")');
    await showKeyBadge("SCHEDULE X REGISTRY", "Psychotropics & Barbiturates Dispensing Audit");
    await page.waitForTimeout(1800);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Date Filtering & Audit Query Lookup
  await playScene(4, async () => {
    // Switch back to Schedule H1 or All
    const allTab = page.locator('button:has-text("All Controlled")');
    await allTab.click();
    await page.waitForTimeout(400);

    const searchInput = page.locator('input[placeholder*="Search patient, doctor"]');
    await spotlight('input[placeholder*="Search patient, doctor"]');
    await showKeyBadge("AUDIT FILTERS", "Filter by Date Range, Prescriber or Patient Name");
    await page.waitForTimeout(1000);

    await searchInput.fill("Amoxicillin");
    await page.waitForTimeout(1000);

    await showKeyBadge("INSPECTOR READY", "Contemporaneous Logs · 100% Compliant Register");
    await page.waitForTimeout(2000);

    await clearSpotlight();
    await clearKeyBadge();
  });
};
