import type { ScenarioRunner } from "./types";

export const runVID6_5: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  console.log("Loading Medical Representatives Master scenario...");
  await page.goto(`${baseUrl}/dashboard/settings/medical-reps`);
  await page.waitForSelector('h1, button:has-text("Add Medical Rep")', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Scene 1: Welcome & MR Directory Overview
  await playScene(0, async () => {
    await spotlight(".grid, button:has-text('Add Medical Rep')");
    await showKeyBadge("MEDICAL REPS (MR)", "Field Representative Directory · Pharma Manufacturer Affiliations");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Examine Registered Representatives Dashboard
  await playScene(1, async () => {
    await spotlight(".grid.grid-cols-1");
    await showKeyBadge("MR ROSTER", "Company Name · Contact Details · Commission Incentive Rates");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Open Add Medical Rep Modal & Enter Profile
  await playScene(2, async () => {
    const addBtn = page.locator('button:has-text("Add Medical Rep")').first();
    if (await addBtn.isVisible()) {
      await spotlight('button:has-text("Add Medical Rep")');
      await page.waitForTimeout(600);
      await addBtn.click();
      await page.waitForTimeout(600);
    }

    const nameInput = page.locator(".fixed input[name='name']").first();
    if (await nameInput.isVisible()) {
      await nameInput.fill("Sandeep Verma");
    }

    const companyInput = page.locator(".fixed input[name='companyName']").first();
    if (await companyInput.isVisible()) {
      await companyInput.fill("Sun Pharma Laboratories");
    }

    const phoneInput = page.locator(".fixed input[name='phone']").first();
    if (await phoneInput.isVisible()) {
      await phoneInput.fill("98190 44321");
    }

    await spotlight(".fixed.inset-0, .bg-surface");
    await showKeyBadge("NEW REPRESENTATIVE", "Direct Field Liaison · Pharma Manufacturer & Mobile Contact");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Configure Commission Incentive Terms
  await playScene(3, async () => {
    const commInput = page.locator(".fixed input[name='commissionRatePct']").first();
    if (await commInput.isVisible()) {
      await commInput.fill("5.0");
    }

    await spotlight(".fixed.inset-0 .bg-surface input[name='commissionRatePct'], .fixed.inset-0 .bg-surface");
    await showKeyBadge("COMMISSION RATE", "Contracted 5.0% Prescription & Sample Incentive Terms");
    await page.waitForTimeout(2200);

    const submitBtn = page.locator('.fixed button[type="submit"]:has-text("Save Representative")').first();
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
      await page.waitForTimeout(800);
    }

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Active Status & Conclude Phase 6
  await playScene(4, async () => {
    await spotlight(".grid.grid-cols-1, .card:last-child");
    await showKeyBadge("LIAISON ACTIVE", "Real-Time Active/Inactive Toggle · Complete Phase 6 CRM Suite");
    await page.waitForTimeout(2400);

    await clearSpotlight();
    await clearKeyBadge();
  });
};
