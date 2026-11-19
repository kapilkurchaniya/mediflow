import type { ScenarioRunner } from "./types";

export const runVID3_4: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  console.log("Loading Prescriptions Registry scenario...");
  await page.goto(`${baseUrl}/dashboard/compliance/prescriptions`);
  await page.waitForSelector('input[placeholder*="Search by patient"]', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Scene 1: Introduction to Inward Prescription Registry
  await playScene(0, async () => {
    await spotlight('h1:has-text("Prescriptions")');
    await showKeyBadge("RX REPOSITORY", "Digital Prescription Vault & Statutory Compliance");
    await page.waitForTimeout(2000);

    const newBtn = page.locator('button:has-text("New Prescription")').first();
    if (await newBtn.isVisible()) {
      await spotlight('button:has-text("New Prescription")');
    }
    await page.waitForTimeout(1800);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Open Inward Prescription Recording Modal
  await playScene(1, async () => {
    const newBtn = page.locator('button:has-text("New Prescription")').first();
    await newBtn.click();

    // Modal appears
    const modalHeader = page.locator('h2:has-text("New Prescription Record")');
    await modalHeader.waitFor({ state: "visible", timeout: 5000 });
    await page.waitForTimeout(500);

    await spotlight("div.bg-white.rounded-2xl");
    await showKeyBadge("INWARD RX DIGITIZATION", "Record Inbound Rx Received at Retail Counter");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Enter Patient Details & Prescribing Doctor Linkage
  await playScene(2, async () => {
    // Fill Patient Name
    const nameInput = page.locator('input[placeholder*="Ramesh Kumar"]');
    await nameInput.fill("Ramesh Kumar");
    await page.waitForTimeout(300);

    // Fill Phone
    const phoneInput = page.locator('input[placeholder*="9876543210"]');
    if (await phoneInput.isVisible()) {
      await phoneInput.fill("9876543210");
      await page.waitForTimeout(300);
    }

    // Fill Age
    const ageInput = page.locator('input[placeholder*="35"]');
    if (await ageInput.isVisible()) {
      await ageInput.fill("42");
      await page.waitForTimeout(300);
    }

    // Select Doctor from Registry dropdown
    const docSelect = page.locator("select").nth(1); // after gender select
    const optionsCount = await docSelect.locator("option").count();
    if (optionsCount > 1) {
      await docSelect.selectOption({ index: 1 });
    } else {
      const docNameInput = page.locator('input[placeholder*="Dr. A. K. Sharma"]');
      await docNameInput.fill("Dr. Ananya Sen");
      const docRegInput = page.locator('input[placeholder*="MCI-2015"]');
      await docRegInput.fill("WB-61920");
    }
    await page.waitForTimeout(400);

    await spotlight("div.bg-white.rounded-2xl");
    await showKeyBadge("PRESCRIBER LINKED", "Ramesh Kumar (42M) · Linked to Dr. Ananya Sen");
    await page.waitForTimeout(2000);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Add Prescribed Medicine & Dosage Schedule
  await playScene(3, async () => {
    // Medicine Name
    const medInput = page.locator('input[placeholder*="Amoxicillin 500mg"]').first();
    await medInput.fill("Amoxicillin 500mg Capsule");
    await page.waitForTimeout(300);

    // Dosage
    const dosageInput = page.locator('input[placeholder*="500mg"]').first();
    if (await dosageInput.isVisible()) {
      await dosageInput.fill("500mg");
      await page.waitForTimeout(200);
    }

    // Frequency
    const freqInput = page.locator('input[placeholder*="1-0-1"]').first();
    if (await freqInput.isVisible()) {
      await freqInput.fill("1-0-1");
      await page.waitForTimeout(200);
    }

    // Quantity Prescribed
    const qtyInput = page.locator('input[placeholder*="Qty"]').first();
    if (await qtyInput.isVisible()) {
      await qtyInput.fill("10");
      await page.waitForTimeout(200);
    }

    // Diagnosis
    const diagInput = page.locator('input[placeholder*="Upper respiratory"]');
    if (await diagInput.isVisible()) {
      await diagInput.fill("Bacterial Respiratory Infection");
      await page.waitForTimeout(300);
    }

    await spotlight(".bg-ink-50");
    await showKeyBadge("REGIMEN CONFIGURED", "Amoxicillin 500mg · 1-0-1 (5 Days) · Qty: 10");
    await page.waitForTimeout(2000);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Save Prescription & Verify in Registry
  await playScene(4, async () => {
    const saveBtn = page.locator('button:has-text("Save Prescription")');
    await spotlight('button:has-text("Save Prescription")');
    await showKeyBadge("SAVE DIGITAL RX", "Generate Unique Statutory Audit Record");
    await page.waitForTimeout(1000);

    await saveBtn.click();
    await page.waitForSelector("div.bg-white.rounded-2xl", { state: "detached", timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(800);

    // Spotlight the prescription grid / top card
    await spotlight(".grid > div:first-child");
    await showKeyBadge("RX ARCHIVED & READY", "Immutable Record Created · POS Dispensing Enabled");
    await page.waitForTimeout(2400);

    await clearSpotlight();
    await clearKeyBadge();
  });
};
