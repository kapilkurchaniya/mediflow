import type { ScenarioRunner } from "./types";

export const runVID2_4: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  // Navigate to POS billing counter
  console.log("Loading POS billing counter for Customer Selection & Quick Add scenario...");
  await page.goto(`${baseUrl}/dashboard/sales/pos`);
  await page.waitForSelector('input[placeholder*="Search medicine"]', { timeout: 10000 });
  await page.waitForTimeout(500);

  // If a customer is pre-selected, clear it first
  const removeBtn = page.locator('button[title="Remove customer"]');
  if (await removeBtn.isVisible()) {
    await removeBtn.click();
    await page.waitForTimeout(400);
  }

  // Scene 1: Welcome & Overview of Customer & Loyalty Panel
  await playScene(0, async () => {
    // Spotlight Customer & Loyalty panel
    await spotlight('.card:has-text("Customer & Loyalty")');
    await showKeyBadge("PATIENT PROFILES", "Loyalty, Store Credit & History");
    await page.waitForTimeout(2000);

    // Spotlight the search input
    const custInput = page.locator('input[placeholder*="Search customer"]');
    if (await custInput.isVisible()) {
      await spotlight('input[placeholder*="Search customer"]');
      await custInput.focus();
      await page.waitForTimeout(1400);
    }

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Search and Select Existing Customer (Ramesh Kumar)
  await playScene(1, async () => {
    const custInput = page.locator('input[placeholder*="Search customer"]');
    await spotlight('input[placeholder*="Search customer"]');
    await showKeyBadge("SEARCH PATIENT", "Name or 10-Digit Mobile");
    await page.waitForTimeout(800);

    await custInput.fill("");
    await custInput.pressSequentially("Ramesh", { delay: 70 });
    await page.waitForTimeout(600);

    // Spotlight the dropdown options
    const dropdown = page.locator('.card:has-text("Customer & Loyalty") .shadow-pop');
    await dropdown.waitFor({ state: "visible", timeout: 5000 });
    await spotlight('.card:has-text("Customer & Loyalty") .shadow-pop');
    await page.waitForTimeout(1400);

    // Click Ramesh Kumar
    const rameshItem = page.locator('.card:has-text("Customer & Loyalty") .shadow-pop button:has-text("Ramesh")').first();
    await rameshItem.click();
    await page.waitForTimeout(800);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Inspect Loyalty Points & Store Credit Limit
  await playScene(2, async () => {
    // Spotlight the customer card
    await spotlight('.card:has-text("Customer & Loyalty") div:has(> .font-bold:has-text("Ramesh"))');
    await showKeyBadge("RAMESH KUMAR", "150 Pts · Credit Limit ₹5,000");
    await page.waitForTimeout(2200);

    // Spotlight the loyalty badge
    const loyaltyBadge = page.locator('.card:has-text("Customer & Loyalty") .badge-brand');
    if (await loyaltyBadge.isVisible()) {
      await spotlight('.card:has-text("Customer & Loyalty") .badge-brand');
      await page.waitForTimeout(1800);
    }

    // Now clear Ramesh so we can demonstrate Quick Add in Scene 4
    const removeCustBtn = page.locator('button[title="Remove customer"]');
    if (await removeCustBtn.isVisible()) {
      await removeCustBtn.click();
      await page.waitForTimeout(600);
    }

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: 3-Second Quick Add for New Walk-In Patient
  await playScene(3, async () => {
    // Spotlight the New (Alt+N) button
    const newBtn = page.locator('button:has-text("New (Alt+N)")');
    await spotlight('button:has-text("New (Alt+N)")');
    await showKeyBadge("3-SECOND QUICK ADD", "Alt + N");
    await page.waitForTimeout(1200);

    // Click New button
    await newBtn.click();
    await page.waitForSelector('h3:has-text("Quick Add Customer")', { timeout: 5000 });
    await page.waitForTimeout(400);

    // Spotlight the Quick Add modal
    await spotlight('.card:has(h3:has-text("Quick Add Customer"))');

    // Fill Full Name
    const nameInput = page.locator('input[placeholder*="Ramesh Patel"]');
    await nameInput.fill("");
    await nameInput.pressSequentially("Sunita Sharma", { delay: 50 });
    await page.waitForTimeout(400);

    // Fill Phone
    const phoneInput = page.locator('input[placeholder*="10-digit mobile number"]');
    await phoneInput.fill("");
    await phoneInput.pressSequentially("9811223344", { delay: 50 });
    await page.waitForTimeout(600);

    // Click Save Customer
    const saveBtn = page.locator('button:has-text("Save Customer")');
    await saveBtn.click();

    // Wait for modal to close and Sunita Sharma to appear on the card
    await page.waitForSelector("text=Sunita Sharma", { timeout: 8000 });
    await page.waitForTimeout(600);

    // Spotlight the newly created customer badge
    await spotlight('.card:has-text("Customer & Loyalty")');
    await showKeyBadge("SAVED & ATTACHED", "Sunita Sharma (9811223344)");
    await page.waitForTimeout(2000);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Outro & Next Steps
  await playScene(4, async () => {
    // Spotlight Customer card & TotalsBar
    await spotlight('.card:has-text("Customer & Loyalty")');
    await showKeyBadge("PATIENT RETENTION", "Next: Split-Tender Payments (F8)");
    await page.waitForTimeout(3000);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Cleanup
  await clearSpotlight();
  await clearKeyBadge();
  await page.waitForTimeout(300);
};
