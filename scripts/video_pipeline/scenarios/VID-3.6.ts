import type { ScenarioRunner } from "./types";

export const runVID3_6: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  console.log("Loading Statutory Register Printing scenario...");
  await page.goto(`${baseUrl}/dashboard/compliance`);
  await page.waitForSelector('h1:has-text("Drug Dispensing Registers")', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Scene 1: Inspection Readiness Overview
  await playScene(0, async () => {
    await spotlight('h1:has-text("Drug Dispensing Registers")');
    await showKeyBadge("INSPECTION READY", "Instant Statutory Register Generation on Demand");
    await page.waitForTimeout(2000);

    const printLink = page.locator('a:has-text("Print Register")').first();
    if (await printLink.isVisible()) {
      await spotlight('a:has-text("Print Register")');
    }
    await page.waitForTimeout(1800);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Configure Date Range & Prepare Print View
  await playScene(1, async () => {
    const h1Tab = page.locator('button:has-text("Schedule H1 Register")');
    await h1Tab.click();
    await page.waitForTimeout(500);

    await spotlight('input[title="From date"], input[title="To date"]');
    await showKeyBadge("SELECT AUDIT PERIOD", "Target Month or Quarter for Drug Control Verification");
    await page.waitForTimeout(1800);

    const printLink = page.locator('a:has-text("Print Register")').first();
    await spotlight('a:has-text("Print Register")');
    await showKeyBadge("LAUNCH PRINT VIEW", "One-Click Inspector-Ready Form 35 Generation");
    await page.waitForTimeout(1600);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Form 35 Layout, Store DL & Legal Citation
  await playScene(2, async () => {
    await page.goto(`${baseUrl}/dashboard/compliance/schedule-h1/print`);
    await page.waitForSelector('text="STATUTORY REGISTER OF SCHEDULE H1 DRUGS"', { timeout: 10000 });
    await page.waitForTimeout(800);

    // Spotlight the top header and statutory banner
    await spotlight(".border-b-2.border-neutral-900, .border.border-neutral-900");
    await showKeyBadge("FORM 35 A4 LANDSCAPE", "Drug Licence Numbers · Rule 65(3)(h) Mandate");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Contemporaneous Audit Table Review
  await playScene(3, async () => {
    // Spotlight data table
    await spotlight("table");
    await showKeyBadge("DETAILED AUDIT TRAIL", "Patient Address · Doctor MCI No · Batch · Expiry · Qty");
    await page.waitForTimeout(2400);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Statutory Attestation & Inspector Sign-Off Block
  await playScene(4, async () => {
    // Scroll down to attestation section
    await page.evaluate(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    });
    await page.waitForTimeout(800);

    await spotlight(".grid.grid-cols-3");
    await showKeyBadge("OFFICIAL SIGN-OFF", "Registered Pharmacist, Licensee & Inspector Stamp");
    await page.waitForTimeout(2400);

    await clearSpotlight();
    await clearKeyBadge();
  });
};
