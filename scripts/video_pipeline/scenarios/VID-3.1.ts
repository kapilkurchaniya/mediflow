import type { ScenarioRunner } from "./types";

export const runVID3_1: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  // Navigate to POS billing counter
  console.log("Loading POS billing counter for Schedule H Compliance scenario...");
  await page.goto(`${baseUrl}/dashboard/sales/pos`);
  await page.waitForSelector('input[placeholder*="Search medicine"]', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Clear existing cart if any
  const clearBtn = page.locator('button[title*="New bill"]');
  if (await clearBtn.isVisible()) {
    await clearBtn.click();
    await page.waitForTimeout(400);
  }

  // Scene 1: Welcome & Overview of Schedule H dispensing
  await playScene(0, async () => {
    await spotlight('h1:has-text("POS Billing Counter")');
    await showKeyBadge("SCHEDULE H COMPLIANCE", "Statutory Prescription Rules · Drugs & Cosmetics Act");
    await page.waitForTimeout(2000);

    // Spotlight the search input
    await spotlight('input[placeholder*="Search medicine"]');
    await page.waitForTimeout(1800);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Add Schedule H Medicine & Detect Rx Alert
  await playScene(1, async () => {
    const searchInput = page.locator('input[placeholder*="Search medicine"]');
    await spotlight('input[placeholder*="Search medicine"]');
    await showKeyBadge("F3 / SEARCH", "Add Amoxicillin 500mg (Schedule H Antibiotic)");
    await page.waitForTimeout(600);

    await searchInput.fill("");
    await searchInput.pressSequentially("Amoxicillin", { delay: 55 });
    await page.waitForTimeout(800);

    const firstResult = page.locator(".card.shadow-pop table.data-table tbody tr").first();
    await firstResult.waitFor({ state: "visible", timeout: 5000 });
    await firstResult.click();
    await page.waitForTimeout(800);

    // Spotlight the cart row and the Rx warning badge
    await spotlight(".card:has(table.data-table) table.data-table tbody tr:first-child");
    await showKeyBadge("SCHEDULE H DETECTED", "Rx Required · Controlled Dispensing Active");
    await page.waitForTimeout(2400);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Automatic Compliance Panel & Doctor Selection
  await playScene(2, async () => {
    const toggleBtn = page.locator('button:has-text("Doctor & Prescription")').first();
    await toggleBtn.waitFor({ state: "visible", timeout: 5000 });

    // Check if panel is already expanded; if not, click toggle
    const docSelect = page.locator('.card:has(button:has-text("Doctor & Prescription")) select').first();
    const isExpanded = await docSelect.isVisible().catch(() => false);
    if (!isExpanded) {
      await toggleBtn.click();
      await page.waitForTimeout(400);
    }

    // Spotlight the expanded Compliance Panel
    await spotlight('.card:has(button:has-text("Doctor & Prescription"))');
    await showKeyBadge("DOCTOR & RX PANEL", "Prescriber & Prescription Mandate");
    await page.waitForTimeout(1000);

    // Select registered doctor (index 1 is Dr. Rajesh Sharma)
    if (await docSelect.isVisible()) {
      await docSelect.selectOption({ index: 1 });
      await page.waitForTimeout(600);
      await showKeyBadge("PRESCRIBER LINKED", "Dr. Rajesh Sharma · MCI-48291 Auto-Filled");
    } else {
      // Fallback: fill doctor name directly into input
      const docNameInput = page.locator('input[placeholder="Dr. Name"]');
      if (await docNameInput.isVisible()) {
        await docNameInput.fill("Dr. Rajesh Sharma");
      }
      const regInput = page.locator('input[placeholder*="MCI-"]');
      if (await regInput.isVisible()) {
        await regInput.fill("MCI-48291");
      }
      await showKeyBadge("PRESCRIBER RECORDED", "Dr. Rajesh Sharma · Reg MCI-48291");
    }
    await page.waitForTimeout(1800);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Enter Prescription Details & Validate Mandate
  await playScene(3, async () => {
    await spotlight('.card:has(button:has-text("Doctor & Prescription"))');
    await showKeyBadge("RX DETAILS", "Enter Prescription Slip Number & Patient Info");
    await page.waitForTimeout(600);

    // Fill Prescription Ref
    const rxInput = page.locator('input[placeholder*="Rx-9872"], input[placeholder*="clinic slip"]');
    if (await rxInput.isVisible()) {
      await rxInput.fill("RX-2026/8941");
      await page.waitForTimeout(400);
    }

    // Fill Patient Age
    const ageInput = page.locator('input[placeholder="Age"]');
    if (await ageInput.isVisible()) {
      await ageInput.fill("34");
      await page.waitForTimeout(400);
    }

    await showKeyBadge("RX VALIDATED", "Prescription Verified · Regulatory Mandate Satisfied");
    await page.waitForTimeout(2000);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Counter Settlement & Statutory Register Sync
  await playScene(4, async () => {
    // Spotlight Totals Bar ready to bill
    await spotlight(".card:has-text('Total Payable')");
    await showKeyBadge("STATUTORY READY", "Logs to Schedule H Register · Ready for F10 / Cash");
    await page.waitForTimeout(2600);

    await clearSpotlight();
    await clearKeyBadge();
  });
};
