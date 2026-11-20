import type { ScenarioRunner } from "./types";

export const runVID2_9: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  // Navigate to POS billing counter
  console.log("Loading POS billing counter for Auto-FEFO Batch Engine scenario...");
  await page.goto(`${baseUrl}/dashboard/sales/pos`);
  await page.waitForSelector('input[placeholder*="Search medicine"]', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Clear existing cart if any
  const clearBtn = page.locator('button[title*="New bill"]');
  if (await clearBtn.isVisible()) {
    await clearBtn.click();
    await page.waitForTimeout(400);
  }

  // Scene 1: Welcome & Overview of Auto-FEFO Principle
  await playScene(0, async () => {
    await spotlight('h1:has-text("POS Billing Counter")');
    await showKeyBadge("AUTO-FEFO BATCH ENGINE", "First-Expiry, First-Out Dispensing Automation");
    await page.waitForTimeout(2200);

    // Spotlight the search bar
    await spotlight('input[placeholder*="Search medicine"]');
    await page.waitForTimeout(2000);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Add Medicine & Earliest Batch Auto-Allocation
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

    // Spotlight the batch column in the cart row showing PCM-26E
    const cartRow = page.locator(".card table.data-table tbody tr").first();
    await cartRow.waitFor({ state: "visible", timeout: 4000 });

    const batchCell = cartRow.locator("td").nth(2);
    await spotlight("table.data-table tbody tr:first-child td:nth-child(3)");
    await showKeyBadge("AUTO-ALLOCATED: PCM-26E", "Exp: 2026-09-30 · Earliest Expiry Batch Picked");
    await page.waitForTimeout(2600);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Inspect Batch Dropdown & Multi-Batch Visibility
  await playScene(2, async () => {
    // Focus and click the batch selector dropdown to reveal all available batches
    const batchSelect = page.locator(".card table.data-table tbody tr select").first();
    if (await batchSelect.isVisible()) {
      await spotlight(".card table.data-table tbody tr select");
      await showKeyBadge("BATCH REGISTER", "Chronological Expiry Ranking & Available Stock");
      await batchSelect.focus();
      await page.waitForTimeout(2400);
    } else {
      await spotlight("table.data-table tbody tr:first-child td:nth-child(3)");
      await showKeyBadge("BATCH DETAILS", "Batch PCM-26E · Verified Expiry");
      await page.waitForTimeout(2000);
    }

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Transparent Pricing, Pack Conversion & GST Calculation
  await playScene(3, async () => {
    // Set packs to 3
    const cartRow = page.locator(".card table.data-table tbody tr").first();
    const packInput = cartRow.locator('input[type="number"]').first();
    await packInput.click();
    await packInput.fill("3");
    await page.waitForTimeout(800);

    // Spotlight the cart row and TotalsBar
    await spotlight('.card:has-text("Total Payable")');
    await showKeyBadge("PRICING & GST INTEGRITY", "3 Strips = ₹90.00 · Transparent Tax Slicing");
    await page.waitForTimeout(2500);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Complete Sale (F10) & Receipt Batch Traceability
  await playScene(4, async () => {
    const finalizeBtn = page.locator('button:has-text("Finalize Bill")');
    await spotlight('button:has-text("Finalize Bill")');
    await showKeyBadge("F10 · FINALIZE BILL", "Dispensed Batch Printed on Receipt");
    await page.waitForTimeout(1800);

    await finalizeBtn.click();

    // Wait for thermal receipt
    await page.waitForSelector('#invoice-printable, text=Tax Invoice', { timeout: 8000 }).catch(() => null);
    await page.waitForTimeout(1000);

    const printable = page.locator('#invoice-printable');
    if (await printable.isVisible()) {
      await spotlight('#invoice-printable');
      await showKeyBadge("INVOICE GENERATED", "Batch PCM-26E Logged for Drug Audit Traceability");
      await page.waitForTimeout(2400);
    }

    await clearSpotlight();
    await clearKeyBadge();
  });
};
