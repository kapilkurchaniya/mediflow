import type { ScenarioRunner } from "./types";

export const runVID2_11: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  // Navigate to POS billing counter
  console.log("Loading POS billing counter for Molecule Substitute Finder scenario...");
  await page.goto(`${baseUrl}/dashboard/sales/pos`);
  await page.waitForSelector('input[placeholder*="Search medicine"]', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Clear existing cart if any
  const clearBtn = page.locator('button[title*="New bill"]');
  if (await clearBtn.isVisible()) {
    await clearBtn.click();
    await page.waitForTimeout(400);
  }

  // Scene 1: Welcome & Overview of Substitute Finder
  await playScene(0, async () => {
    await spotlight('h1:has-text("POS Billing Counter")');
    await showKeyBadge("SUBSTITUTE FINDER (F9)", "Therapeutic Salt & Bio-Equivalent Discovery");
    await page.waitForTimeout(2200);

    // Spotlight the search bar
    await spotlight('input[placeholder*="Search medicine"]');
    await page.waitForTimeout(2000);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Add Medicine & Open Substitutes via Alt Button
  await playScene(1, async () => {
    const searchInput = page.locator('input[placeholder*="Search medicine"]');
    await spotlight('input[placeholder*="Search medicine"]');
    await showKeyBadge("F3 / SEARCH", "Search Paracetamol 650");
    await page.waitForTimeout(800);

    await searchInput.fill("");
    await searchInput.pressSequentially("Paracetamol", { delay: 60 });
    await searchInput.press("Enter");

    const firstResult = page.locator(".card.shadow-pop table.data-table tbody tr").first();
    await firstResult.waitFor({ state: "visible", timeout: 6000 });
    await firstResult.click();
    await page.waitForTimeout(600);

    // Spotlight the Alt substitute button in the cart row
    const altBtn = page.locator('.card table.data-table tbody tr button:has-text("Alt")').first();
    await altBtn.waitFor({ state: "visible", timeout: 4000 });
    await spotlight('.card table.data-table tbody tr button:has-text("Alt")');
    await showKeyBadge("ALT / F9", "Find Therapeutic Molecule Substitutes");
    await page.waitForTimeout(1400);

    // Click Alt button to open modal
    await altBtn.click();
    const modalHeader = page.locator('h3:has-text("Substitute Medicine Finder")');
    await modalHeader.waitFor({ state: "visible", timeout: 5000 });
    await page.waitForTimeout(500);

    // Spotlight the modal
    await spotlight('.card:has(h3:has-text("Substitute Medicine Finder"))');
    await showKeyBadge("SALT: PARACETAMOL 650MG", "In-Stock Bio-Equivalents");
    await page.waitForTimeout(2000);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Inspect Available Alternatives (Calpol 650 Tablet)
  await playScene(2, async () => {
    // Spotlight the row for Calpol 650 Tablet
    const calpolRow = page.locator('.card:has(h3:has-text("Substitute Medicine Finder")) table tbody tr').first();
    await calpolRow.waitFor({ state: "visible", timeout: 5000 });
    await spotlight('.card:has(h3:has-text("Substitute Medicine Finder")) table tbody tr:first-child');
    await showKeyBadge("CALPOL 650 TABLET", "Same Molecule · Stock: 60 Strips · ₹30.00");
    await page.waitForTimeout(2600);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Click Select & Real-Time Cart Replacement
  await playScene(3, async () => {
    const selectBtn = page.locator('.card:has(h3:has-text("Substitute Medicine Finder")) button:has-text("+ Select")').first();
    await spotlight('.card:has(h3:has-text("Substitute Medicine Finder")) button:has-text("+ Select")');
    await showKeyBadge("+ SELECT SUBSTITUTE", "Seamless Item Replacement");
    await page.waitForTimeout(1200);

    // Click select
    await selectBtn.click();
    await page.waitForTimeout(1000);

    // Spotlight the updated cart row
    const cartRow = page.locator(".card table.data-table tbody tr").first();
    await cartRow.waitFor({ state: "visible", timeout: 5000 });
    await spotlight('.card:has(table.data-table)');
    await showKeyBadge("SUBSTITUTE LOADED", "Cart Updated with Calpol 650 · Margin Preserved");
    await page.waitForTimeout(2400);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Complete Sale (F10) & Wrap-Up
  await playScene(4, async () => {
    const finalizeBtn = page.locator('button:has-text("Finalize Bill")');
    await spotlight('button:has-text("Finalize Bill")');
    await showKeyBadge("F10 · FINALIZE BILL", "Dispense In-Stock Substitute");
    await page.waitForTimeout(1800);

    await finalizeBtn.click();

    // Wait for thermal receipt
    await page.waitForSelector('#invoice-printable, text=Tax Invoice', { timeout: 8000 }).catch(() => null);
    await page.waitForTimeout(1000);

    const printable = page.locator('#invoice-printable');
    if (await printable.isVisible()) {
      await spotlight('#invoice-printable');
      await showKeyBadge("INVOICE GENERATED", "Calpol 650 Logged on Patient Invoice");
      await page.waitForTimeout(2400);
    }

    await clearSpotlight();
    await clearKeyBadge();
  });
};
