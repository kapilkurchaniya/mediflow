import type { ScenarioRunner } from "./types";

export const runVID2_8: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  // Navigate to POS billing counter
  console.log("Loading POS billing counter for Resuming Parked Bills scenario...");
  await page.goto(`${baseUrl}/dashboard/sales/pos`);
  await page.waitForSelector('input[placeholder*="Search medicine"]', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Clear existing cart if any
  const clearBtn = page.locator('button[title*="New bill"]');
  if (await clearBtn.isVisible()) {
    await clearBtn.click();
    await page.waitForTimeout(400);
  }

  // Scene 1: Welcome & Overview of Resuming Parked Bills
  await playScene(0, async () => {
    await spotlight('h1:has-text("POS Billing Counter")');
    await showKeyBadge("RESUMING PARKED BILLS", "Instant Cart Restoration via F7 & Live Revalidation");
    await page.waitForTimeout(2000);

    // Spotlight the Parked badge at top
    const parkedBtn = page.locator('button:has-text("Parked")');
    if (await parkedBtn.isVisible()) {
      await spotlight('button:has-text("Parked")');
      await page.waitForTimeout(2200);
    }

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Access Parked Bills via F7 / Button
  await playScene(1, async () => {
    const parkedBtn = page.locator('button:has-text("Parked")');
    await spotlight('button:has-text("Parked")');
    await showKeyBadge("F7", "Open Parked Bills Register");
    await page.waitForTimeout(1400);

    // Press F7 or click button
    await page.keyboard.press("F7");
    const modalHeader = page.locator('h3:has-text("Parked Bills Register")');
    await modalHeader.waitFor({ state: "visible", timeout: 5000 }).catch(async () => {
      if (await parkedBtn.isVisible()) {
        await parkedBtn.click();
        await modalHeader.waitFor({ state: "visible", timeout: 5000 });
      }
    });
    await page.waitForTimeout(600);

    // Spotlight the modal
    await spotlight('.card:has(h3:has-text("Parked Bills Register"))');
    await showKeyBadge("PARKED REGISTER", "Customer Name, Time, Items & Notes");
    await page.waitForTimeout(2400);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Inspect Details & Click Resume
  await playScene(2, async () => {
    // Spotlight the target row
    const targetRow = page.locator('.card:has(h3:has-text("Parked Bills Register")) table tbody tr').first();
    await targetRow.waitFor({ state: "visible", timeout: 4000 });
    await spotlight('.card:has(h3:has-text("Parked Bills Register")) table tbody tr:first-child');
    await showKeyBadge("RAMESH KUMAR", "₹150.00 · Stepped out for cash");
    await page.waitForTimeout(1800);

    // Click Resume button
    const resumeBtn = targetRow.locator('button:has-text("Resume")');
    await resumeBtn.click();
    await page.waitForTimeout(1000);

    // Spotlight the restored cart table
    const cartRow = page.locator(".card table.data-table tbody tr").first();
    await cartRow.waitFor({ state: "visible", timeout: 5000 });
    await spotlight('.card:has(table.data-table)');
    await showKeyBadge("CART RESTORED", "All Items & Customer Re-Allocated");
    await page.waitForTimeout(2000);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Live Stock & Expiry Revalidation
  await playScene(3, async () => {
    // Spotlight cart items and TotalsBar
    await spotlight('.card:has-text("Total Payable")');
    await showKeyBadge("LIVE REVALIDATION", "Batch Stock & Expiry Re-Checked Live");
    await page.waitForTimeout(2400);

    // Spotlight the customer card
    const custCard = page.locator('.card:has-text("Customer & Loyalty")');
    if (await custCard.isVisible()) {
      await spotlight('.card:has-text("Customer & Loyalty")');
      await page.waitForTimeout(2000);
    }

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Complete Resumed Bill (F10) & Wrap-Up
  await playScene(4, async () => {
    const finalizeBtn = page.locator('button:has-text("Finalize Bill")');
    await spotlight('button:has-text("Finalize Bill")');
    await showKeyBadge("F10 · FINALIZE BILL", "Complete Counter Transaction");
    await page.waitForTimeout(1800);

    // Click Finalize
    await finalizeBtn.click();

    // Wait for thermal receipt
    await page.waitForSelector('#invoice-printable, text=Tax Invoice', { timeout: 8000 }).catch(() => null);
    await page.waitForTimeout(1000);

    const printable = page.locator('#invoice-printable');
    if (await printable.isVisible()) {
      await spotlight('#invoice-printable');
      await showKeyBadge("INVOICE GENERATED", "Parked Bill Completed & Removed from Hold Register");
      await page.waitForTimeout(2400);
    }

    await clearSpotlight();
    await clearKeyBadge();
  });
};
