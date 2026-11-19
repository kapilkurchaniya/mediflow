import type { ScenarioRunner } from "./types";

export const runVID3_3: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  // Navigate to Doctors directory in Compliance section
  console.log("Loading Doctor Master Directory scenario...");
  await page.goto(`${baseUrl}/dashboard/compliance/doctors`);
  await page.waitForSelector('input[placeholder*="Search by name"]', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Scene 1: Welcome & Overview of Doctor Master Directory
  await playScene(0, async () => {
    await spotlight('h1:has-text("Doctor & Prescriber Master")');
    await showKeyBadge("DOCTOR DIRECTORY", "Prescriber Credential Registry & MCI Verification");
    await page.waitForTimeout(2000);

    // Spotlight the Add Doctor button
    await spotlight('button:has-text("Add Doctor")');
    await page.waitForTimeout(1800);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Inspect Existing Prescriber Records
  await playScene(1, async () => {
    // Spotlight the doctor card grid
    const docCards = page.locator(".grid div.card").first();
    await docCards.waitFor({ state: "visible", timeout: 5000 });
    await spotlight(".grid div.card");
    await showKeyBadge("PRESCRIBER REGISTRY", "MCI Reg No · Qualifications · Hospital Affiliation");
    await page.waitForTimeout(2400);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Open Add Prescriber Modal & Fill Details
  await playScene(2, async () => {
    const addBtn = page.locator('button:has-text("Add Doctor")').first();
    await addBtn.click();

    // Modal appears
    const modalHeader = page.locator('h2:has-text("Add Prescribing Doctor")');
    await modalHeader.waitFor({ state: "visible", timeout: 5000 });
    await page.waitForTimeout(500);

    // Spotlight modal
    await spotlight("div.bg-white.rounded-2xl");
    await showKeyBadge("REGISTER PRESCRIBER", "Dr. Ananya Sen · Reg WB-61920 · Pediatrics");
    await page.waitForTimeout(800);

    // Fill Name
    const nameInput = page.locator('input[placeholder*="Rajesh Verma"]');
    await nameInput.fill("Dr. Ananya Sen");
    await page.waitForTimeout(300);

    // Fill Reg No
    const regInput = page.locator('input[placeholder*="MCI-2018"]');
    await regInput.fill("WB-61920");
    await page.waitForTimeout(300);

    // Fill Specialization
    const specInput = page.locator('input[placeholder*="Cardiologist"]');
    if (await specInput.isVisible()) {
      await specInput.fill("Pediatrician");
      await page.waitForTimeout(300);
    }

    // Fill Hospital
    const hospInput = page.locator('input[placeholder*="City Care"]');
    if (await hospInput.isVisible()) {
      await hospInput.fill("Children Wellness Clinic");
      await page.waitForTimeout(300);
    }

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Save Prescriber & Verify Active Status
  await playScene(3, async () => {
    const submitBtn = page.locator('button:has-text("Add to Registry")').first();
    await spotlight('button:has-text("Add to Registry")');
    await showKeyBadge("SAVE PRESCRIBER", "Store Validated Credentials Across Chain");
    await page.waitForTimeout(1000);

    await submitBtn.click();
    await page.waitForSelector(".grid div.card:has-text('Dr. Ananya Sen')", { timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(800);

    // Spotlight the newly created card or doctor list
    const card = page.locator(".grid div.card:has-text('Dr. Ananya Sen')").first();
    if (await card.isVisible()) {
      await spotlight(".grid div.card:has-text('Dr. Ananya Sen')");
    } else {
      await spotlight(".grid");
    }
    await showKeyBadge("ACTIVE IN DIRECTORY", "Dr. Ananya Sen (WB-61920) · Ready at POS");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Search & Audit Readiness Wrap-Up
  await playScene(4, async () => {
    const searchInput = page.locator('input[placeholder*="Search by name"]');
    await spotlight('input[placeholder*="Search by name"]');
    await showKeyBadge("INSTANT SEARCH", "Filter by Name, MCI Number or Hospital");
    await page.waitForTimeout(800);

    await searchInput.fill("Ananya");
    await page.waitForTimeout(1000);

    await showKeyBadge("AUDIT COMPLIANT", "100% Inspection Proof · Prescriber Master Ready");
    await page.waitForTimeout(1800);

    await clearSpotlight();
    await clearKeyBadge();
  });
};
