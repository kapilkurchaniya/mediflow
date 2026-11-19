import type { ScenarioRunner } from "./types";

export const runVID1_5: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  // Initial navigation to /dashboard/settings (pre-authenticated as admin)
  console.log("Loading store settings page...");
  await page.goto(`${baseUrl}/dashboard/settings`);
  await page.waitForSelector("#name", { timeout: 10000 });
  await page.waitForTimeout(500);

  // Scene 1: Introduction to Pharmacy Profile & Identity
  await playScene(0, async () => {
    // Spotlight the header first
    await spotlight(".page > div:first-child");
    await showKeyBadge("SETTINGS", "Store Profile");
    await page.waitForTimeout(1600);

    // Spotlight the Pharmacy Profile Card
    await spotlight(".card:has(#name)");
    await page.waitForTimeout(1400);

    // Focus on the store name field
    const nameInput = page.locator("#name");
    await spotlight("div:has(> #name)");
    await nameInput.focus();
    await page.waitForTimeout(1800);

    await clearKeyBadge();
  });

  // Scene 2: Drug Licenses (Form 20B/21B) & GSTIN Registration
  await playScene(1, async () => {
    // Spotlight Drug License field
    await spotlight("div:has(> #drugLicenseNo)");
    await showKeyBadge("FORM 20B / 21B", "Retail Drug License");
    const dlInput = page.locator("#drugLicenseNo");
    await dlInput.focus();
    await dlInput.fill("DL-20B-78945, 21B-78946");
    await page.waitForTimeout(2800);

    // Spotlight GSTIN field
    await clearKeyBadge();
    await spotlight("div:has(> #gstin)");
    await showKeyBadge("GSTIN", "15-Digit GST Identification");
    const gstinInput = page.locator("#gstin");
    await gstinInput.focus();
    await gstinInput.fill("27AAAAA0000A1Z5");
    await page.waitForTimeout(2800);

    await clearKeyBadge();
  });

  // Scene 3: Bill Serial Prefix under GST Rule 46
  await playScene(2, async () => {
    // Spotlight Invoice Prefix
    await spotlight("div:has(> #invoicePrefix)");
    await showKeyBadge("RULE 46", "Max 16 Chars Serial");

    const prefixInput = page.locator("#invoicePrefix");
    await prefixInput.focus();
    await prefixInput.fill("INV");
    await page.waitForTimeout(2200);

    // Spotlight the hint under invoice prefix explaining Rule 46 formatting
    const hint = page.locator("div:has(> #invoicePrefix) p.hint");
    if (await hint.isVisible()) {
      await spotlight("div:has(> #invoicePrefix) p.hint");
    }
    await page.waitForTimeout(3000);

    await clearKeyBadge();
  });

  // Scene 4: Billing Preferences & Thermal Printing Formats
  await playScene(3, async () => {
    // Scroll down to Billing & Printing card
    const printCard = page.locator('.card:has-text("Billing & Thermal Printing")');
    await printCard.scrollIntoViewIfNeeded();
    await spotlight('.card:has-text("Billing & Thermal Printing")');
    await showKeyBadge("PRINT FORMAT", "80mm Thermal vs A4");
    await page.waitForTimeout(2200);

    // Highlight Thermal 80mm option
    const thermalOption = page.locator('.card:has-text("Billing & Thermal Printing") div:has-text("Thermal 80mm Roll")').first();
    if (await thermalOption.isVisible()) {
      await spotlight('.card:has-text("Billing & Thermal Printing") div:has-text("Thermal 80mm Roll")');
      await page.waitForTimeout(2200);
    }

    // Highlight A4 Option
    const a4Option = page.locator('.card:has-text("Billing & Thermal Printing") div:has-text("A4 GST Tax Invoice")').first();
    if (await a4Option.isVisible()) {
      await spotlight('.card:has-text("Billing & Thermal Printing") div:has-text("A4 GST Tax Invoice")');
      await page.waitForTimeout(2200);
    }

    await clearKeyBadge();
  });

  // Scene 5: Save Changes & Phase 1 Conclusion
  await playScene(4, async () => {
    // Scroll submit button into view
    const submitBtn = page.locator('form button[type="submit"]:has-text("Save Changes")');
    await submitBtn.scrollIntoViewIfNeeded();
    await spotlight('form button[type="submit"]:has-text("Save Changes")');
    await showKeyBadge("SAVE SETTINGS", "Instant Sync Across POS");
    await page.waitForTimeout(1400);

    // Click Save Changes
    await submitBtn.click();

    // Wait for saved badge
    const successBadge = page.locator(".badge-success");
    await successBadge.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
    if (await successBadge.isVisible()) {
      await spotlight(".badge-success");
    }

    await showKeyBadge("PHASE 1 COMPLETE", "Next: POS Counter Billing");
    await page.waitForTimeout(3000);

    await clearSpotlight();
    await clearKeyBadge();
  });
};
