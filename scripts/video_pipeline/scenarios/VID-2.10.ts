import type { ScenarioRunner } from "./types";

export const runVID2_10: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  // Navigate to POS billing counter
  console.log("Loading POS billing counter for Audited Manual Batch Overrides scenario...");
  await page.goto(`${baseUrl}/dashboard/sales/pos`);
  await page.waitForSelector('input[placeholder*="Search medicine"]', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Clear existing cart if any
  const clearBtn = page.locator('button[title*="New bill"]');
  if (await clearBtn.isVisible()) {
    await clearBtn.click();
    await page.waitForTimeout(400);
  }

  // Scene 1: Welcome & Overview of Manual Batch Overrides
  await playScene(0, async () => {
    await spotlight('h1:has-text("POS Billing Counter")');
    await showKeyBadge("MANUAL BATCH OVERRIDE", "Cashier Flexibility & Automatic Audit Trail");
    await page.waitForTimeout(2200);

    // Spotlight the search bar
    await spotlight('input[placeholder*="Search medicine"]');
    await page.waitForTimeout(2000);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Add Medicine with Default Auto-FEFO Batch
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

    // Spotlight the batch column showing PCM-26E
    const cartRow = page.locator(".card table.data-table tbody tr").first();
    await cartRow.waitFor({ state: "visible", timeout: 4000 });

    await spotlight("table.data-table tbody tr:first-child td:nth-child(3)");
    await showKeyBadge("DEFAULT AUTO-FEFO: PCM-26E", "Exp: Sep 2026 · System Auto-Allocated");
    await page.waitForTimeout(2600);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Override Batch via Dropdown to PARA-B1
  await playScene(2, async () => {
    const batchSelect = page.locator(".card table.data-table tbody tr select").first();
    await spotlight(".card table.data-table tbody tr select");
    await showKeyBadge("SELECT ALTERNATIVE BATCH", "Switching to PARA-B1 (Exp: Dec 2027)");
    await page.waitForTimeout(1400);

    // Find and select option with PARA-B1
    const options = await batchSelect.locator("option").allTextContents();
    const paraB1Option = options.find((o) => o.includes("PARA-B1"));
    if (paraB1Option) {
      await batchSelect.selectOption({ label: paraB1Option });
    } else if (options.length > 1) {
      await batchSelect.selectOption({ index: 1 });
    }
    await page.waitForTimeout(1000);

    // Spotlight updated batch cell
    await spotlight(".card table.data-table tbody tr select");
    await showKeyBadge("OVERRIDDEN TO: PARA-B1", "Newer Expiry Selected · Margin Recalculated");
    await page.waitForTimeout(2400);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: No Supervisor Friction & Automatic Governance Logging
  await playScene(3, async () => {
    // Spotlight the cart row and TotalsBar
    await spotlight('.card:has-text("Total Payable")');
    await showKeyBadge("NO MANAGER PIN NEEDED", "Zero Counter Friction · Audit Reason Saved");
    await page.waitForTimeout(2800);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Complete Sale (F10) & Thermal Receipt Verification
  await playScene(4, async () => {
    const finalizeBtn = page.locator('button:has-text("Finalize Bill")');
    await spotlight('button:has-text("Finalize Bill")');
    await showKeyBadge("F10 · FINALIZE BILL", "Batch PARA-B1 Printed on Invoice");
    await page.waitForTimeout(1800);

    await finalizeBtn.click();

    // Wait for thermal receipt
    await page.waitForSelector('#invoice-printable, text=Tax Invoice', { timeout: 8000 }).catch(() => null);
    await page.waitForTimeout(1000);

    const printable = page.locator('#invoice-printable');
    if (await printable.isVisible()) {
      await spotlight('#invoice-printable');
      await showKeyBadge("INVOICE GENERATED", "Batch PARA-B1 Recorded to Patient & Stock Audit");
      await page.waitForTimeout(2400);
    }

    await clearSpotlight();
    await clearKeyBadge();
  });
};
