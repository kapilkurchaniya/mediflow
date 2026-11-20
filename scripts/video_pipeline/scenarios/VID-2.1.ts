import type { ScenarioRunner } from "./types";

export const runVID2_1: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  // Navigate to POS billing counter (pre-authenticated)
  console.log("Loading POS billing counter...");
  await page.goto(`${baseUrl}/dashboard/sales/pos`);
  await page.waitForSelector('input[placeholder*="Search medicine"]', { timeout: 10000 });
  await page.waitForTimeout(500);

  // Scene 1: Welcome & F2 New Bill
  await playScene(0, async () => {
    // Spotlight POS billing counter header and F2 badge
    await spotlight('h1:has-text("POS Billing Counter")');
    await showKeyBadge("F2", "New Bill / Reset Counter");
    await page.waitForTimeout(2000);

    // Spotlight the Clear (F2) action button
    const clearBtn = page.locator('button:has-text("Clear (F2)")');
    if (await clearBtn.isVisible()) {
      await spotlight('button:has-text("Clear (F2)")');
      await page.waitForTimeout(1600);
    }

    // Select customer if available
    const customerSelect = page.locator("select").first();
    if ((await customerSelect.count()) > 0) {
      const options = await customerSelect.locator("option").allTextContents();
      const rameshOption = options.find((o) => o.includes("Ramesh"));
      if (rameshOption) {
        await customerSelect.selectOption({ label: rameshOption });
      }
    }

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: F3 Smart Medicine & Salt Search
  await playScene(1, async () => {
    const searchInput = page.locator('input[placeholder*="Search medicine"]');
    await spotlight('input[placeholder*="Search medicine"]');
    await showKeyBadge("F3", "Search Medicine / Molecule");

    await searchInput.click();
    await searchInput.fill("");
    await searchInput.pressSequentially("Paracetamol", { delay: 65 });
    await page.waitForTimeout(600);
    await searchInput.press("Enter");

    // Wait for search results
    await page.waitForSelector(".card.shadow-pop table.data-table tbody tr", { timeout: 6000 });
    await page.waitForTimeout(1500);

    await clearKeyBadge();
  });

  // Scene 3: Auto-FEFO Batch Engine
  await playScene(2, async () => {
    // Spotlight the dropdown results card
    await spotlight(".card.shadow-pop");
    await showKeyBadge("AUTO-FEFO", "Earliest Expiry Batch");
    await page.waitForTimeout(1800);

    // Spotlight the specific Auto-FEFO row (the earliest expiring batch)
    const fefoRow = page.locator(".card.shadow-pop table.data-table tbody tr:has-text('Auto-FEFO')").first();
    if (await fefoRow.isVisible()) {
      await spotlight(".card.shadow-pop table.data-table tbody tr:has-text('Auto-FEFO')");
    }
    await page.waitForTimeout(2600);

    await clearKeyBadge();
  });

  // Scene 4: Add to Cart & Live Net Total
  await playScene(3, async () => {
    // Click earliest expiring batch to add to active cart
    const firstRow = page.locator(".card.shadow-pop table.data-table tbody tr").first();
    await firstRow.click();
    await page.waitForTimeout(800);

    // Spotlight the active cart item row
    await spotlight(".card table.data-table tbody tr");
    await showKeyBadge("CART", "Live GST & Net Payable");
    await page.waitForTimeout(2000);

    // Spotlight the right summary panel (Grand Total / Net Payable)
    const summaryCard = page.locator('.card:has-text("Net Payable")').last();
    if (await summaryCard.isVisible()) {
      await spotlight('.card:has-text("Net Payable")');
      await page.waitForTimeout(2400);
    }

    await clearKeyBadge();
  });

  // Scene 5: Press F10 to Complete & Print Thermal Slip
  await playScene(4, async () => {
    // Spotlight Finalize Bill button
    const submitBtn = page.locator('button:has-text("Finalize Bill")');
    await submitBtn.scrollIntoViewIfNeeded();
    await spotlight('button:has-text("Finalize Bill")');
    await showKeyBadge("F10", "Finalize & Print Invoice");
    await page.waitForTimeout(1800);

    // Press F10 to trigger checkout
    await page.keyboard.press("F10");

    // Wait for print page navigation
    await page.waitForURL("**/print**", { timeout: 8000 }).catch(async () => {
      // Fallback click if key didn't trigger
      if (await submitBtn.isVisible()) {
        await submitBtn.click();
        await page.waitForURL("**/print**", { timeout: 8000 }).catch(() => {});
      }
    });

    // Spotlight the thermal receipt
    const printReceipt = page.locator("#invoice-printable");
    await printReceipt.waitFor({ state: "visible", timeout: 6000 }).catch(() => {});
    if (await printReceipt.isVisible()) {
      await spotlight("#invoice-printable");
    }

    await showKeyBadge("INVOICE ISSUED", "Thermal 80mm Slip");
    await page.waitForTimeout(3000);

    await clearSpotlight();
    await clearKeyBadge();
  });
};
