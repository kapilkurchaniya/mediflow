import type { ScenarioRunner } from "./types";

export const runVID3_2: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  // Navigate to POS billing counter
  console.log("Loading POS billing counter for Schedule H1 & X scenario...");
  await page.goto(`${baseUrl}/dashboard/sales/pos`);
  await page.waitForSelector('input[placeholder*="Search medicine"]', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Clear existing cart if any
  const clearBtn = page.locator('button[title*="New bill"]');
  if (await clearBtn.isVisible()) {
    await clearBtn.click();
    await page.waitForTimeout(400);
  }

  // Scene 1: Welcome & Overview of Schedule H1 & Schedule X
  await playScene(0, async () => {
    await spotlight('h1:has-text("POS Billing Counter")');
    await showKeyBadge("SCHEDULE H1 & X NARCOTICS", "Strict Antibiotic & Psychotropic Statutory Regulations");
    await page.waitForTimeout(2000);

    // Spotlight the search input
    await spotlight('input[placeholder*="Search medicine"]');
    await page.waitForTimeout(1800);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Add Schedule H1 Item & Detect Flag
  await playScene(1, async () => {
    const searchInput = page.locator('input[placeholder*="Search medicine"]');
    await spotlight('input[placeholder*="Search medicine"]');
    await showKeyBadge("F3 / SEARCH", "Add Azithromycin 500mg (Schedule H1 Antibiotic)");
    await page.waitForTimeout(600);

    await searchInput.fill("");
    await searchInput.pressSequentially("Azithromycin", { delay: 55 });
    await page.waitForTimeout(800);

    const firstResult = page.locator(".card.shadow-pop table.data-table tbody tr").first();
    await firstResult.waitFor({ state: "visible", timeout: 5000 });
    await firstResult.click();
    await page.waitForTimeout(800);

    // Spotlight the cart row and red Sched H1 badge
    await spotlight(".card:has(table.data-table) table.data-table tbody tr:first-child");
    await showKeyBadge("SCHEDULE H1 DETECTED", "Azithromycin 500mg · Mandatory Dual Register Recording");
    await page.waitForTimeout(2400);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Lock-Open Compliance Panel & Complete Prescriber Details
  await playScene(2, async () => {
    const toggleBtn = page.locator('button:has-text("Doctor & Prescription")').first();
    await toggleBtn.waitFor({ state: "visible", timeout: 5000 });

    const docSelect = page.locator('.card:has(button:has-text("Doctor & Prescription")) select').first();
    const isExpanded = await docSelect.isVisible().catch(() => false);
    if (!isExpanded) {
      await toggleBtn.click();
      await page.waitForTimeout(400);
    }

    // Spotlight the expanded Compliance Panel
    await spotlight('.card:has(button:has-text("Doctor & Prescription"))');
    await showKeyBadge("MANDATORY COMPLIANCE", "Prescriber & Patient Age Obligation");
    await page.waitForTimeout(1000);

    // Select registered doctor (index 1 is Dr. Rajesh Sharma)
    if (await docSelect.isVisible()) {
      await docSelect.selectOption({ index: 1 });
      await page.waitForTimeout(600);
      await showKeyBadge("PRESCRIBER LINKED", "Dr. Rajesh Sharma · MCI-48291 Auto-Filled");
    } else {
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

  // Scene 4: Enter Prescription Slip Ref & 2-Year Audit Retention
  await playScene(3, async () => {
    await spotlight('.card:has(button:has-text("Doctor & Prescription"))');
    await showKeyBadge("RX NUMBER & AGE", "Mandatory Prescription Reference for H1 Audit");
    await page.waitForTimeout(600);

    // Fill Prescription Ref
    const rxInput = page.locator('input[placeholder*="Rx-9872"], input[placeholder*="clinic slip"]');
    if (await rxInput.isVisible()) {
      await rxInput.fill("H1-RX/2026/0491");
      await page.waitForTimeout(400);
    }

    // Fill Patient Age
    const ageInput = page.locator('input[placeholder="Age"]');
    if (await ageInput.isVisible()) {
      await ageInput.fill("42");
      await page.waitForTimeout(400);
    }

    await showKeyBadge("2-YEAR AUDIT LOGGING", "Automatic Digital H1 Register Retention");
    await page.waitForTimeout(2000);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Settlement & Wrap-Up
  await playScene(4, async () => {
    // Spotlight Totals Bar ready to bill
    await spotlight(".card:has-text('Total Payable')");
    await showKeyBadge("COMPLIANCE VERIFIED", "Zero Audit Risk · Regulatory Dispensing Ready");
    await page.waitForTimeout(2600);

    await clearSpotlight();
    await clearKeyBadge();
  });
};
