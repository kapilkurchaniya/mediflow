import type { ScenarioRunner } from "./types";

export const runVID2_2: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  // Navigate to POS billing counter
  console.log("Loading POS billing counter for Barcode Scanning scenario...");
  await page.goto(`${baseUrl}/dashboard/sales/pos`);
  await page.waitForSelector('input[placeholder*="Search medicine"]', { timeout: 10000 });
  await page.waitForTimeout(500);

  // Scene 1: Welcome & Overview of Barcode Efficiency
  await playScene(0, async () => {
    await spotlight('h1:has-text("POS Billing Counter")');
    await showKeyBadge("BARCODE READY", "Hardware Scanner Support");
    await page.waitForTimeout(1600);

    // Select customer if available
    const customerSelect = page.locator("select").first();
    if ((await customerSelect.count()) > 0) {
      await spotlight("select:first-of-type");
      const options = await customerSelect.locator("option").allTextContents();
      const rameshOption = options.find((o) => o.includes("Ramesh"));
      if (rameshOption) {
        await customerSelect.selectOption({ label: rameshOption });
      }
      await page.waitForTimeout(1400);
    }

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Point & Scan: Auto-detecting Hardware Stream
  await playScene(1, async () => {
    const searchInput = page.locator('input[placeholder*="Search medicine"]');
    await spotlight('input[placeholder*="Search medicine"]');
    await showKeyBadge("SCANNER LISTENER", "Auto-Detects 8-14 Digits");
    await page.waitForTimeout(1500);

    await searchInput.focus();
    await page.waitForTimeout(2000);

    await clearKeyBadge();
  });

  // Scene 3: Fast Scan Simulation & Instant Cart Insertion
  await playScene(2, async () => {
    const searchInput = page.locator('input[placeholder*="Search medicine"]');
    await showKeyBadge("SCAN: 8901234567890", "Azithromycin 500mg");

    // Simulate high-speed barcode gun typing (<40ms per digit)
    await searchInput.fill("");
    await searchInput.pressSequentially("8901234567890", { delay: 35 });
    await searchInput.press("Enter");

    // Wait for item to appear directly in cart table
    const cartRow = page.locator(".card table.data-table tbody tr:has-text('Azithromycin')");
    await cartRow.waitFor({ state: "visible", timeout: 8000 });
    await page.waitForTimeout(600);

    // Spotlight the newly added cart item row
    await spotlight(".card table.data-table tbody tr:has-text('Azithromycin')");
    await showKeyBadge("INSTANT INSERTION", "Batch AZI-01 Auto-Selected");
    await page.waitForTimeout(2400);

    await clearKeyBadge();
  });

  // Scene 4: Live Cart Totals & Net Payable Synchronization
  await playScene(3, async () => {
    // Spotlight cart details
    await spotlight(".card table.data-table tbody tr:has-text('Azithromycin')");
    await showKeyBadge("PACK QUANTITY: 1", "1 Strip · MRP ₹120.00");
    await page.waitForTimeout(1800);

    // Spotlight the right summary panel (Grand Total / Net Payable)
    const summaryCard = page.locator('.card:has-text("Net Payable")').last();
    if (await summaryCard.isVisible()) {
      await spotlight('.card:has-text("Net Payable")');
      await showKeyBadge("NET PAYABLE", "Live GST & Rounding");
      await page.waitForTimeout(2200);
    }

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Outro & Next Step (Loose Tablet Cutting)
  await playScene(4, async () => {
    // Spotlight Finalize Bill button
    const submitBtn = page.locator('button:has-text("Finalize Bill")');
    if (await submitBtn.isVisible()) {
      await spotlight('button:has-text("Finalize Bill")');
    }
    await showKeyBadge("READY FOR CHECKOUT", "Next: Loose Tablet Cutting");
    await page.waitForTimeout(3000);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Final cleanup
  await clearSpotlight();
  await clearKeyBadge();
  await page.waitForTimeout(300);
};
