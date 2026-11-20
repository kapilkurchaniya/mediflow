import type { ScenarioRunner } from "./types";

export const runVID2_13: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  // Navigate to POS billing counter
  console.log("Loading POS billing counter for Line Discounts scenario...");
  await page.goto(`${baseUrl}/dashboard/sales/pos`);
  await page.waitForSelector('input[placeholder*="Search medicine"]', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Clear existing cart if any
  const clearBtn = page.locator('button[title*="New bill"]');
  if (await clearBtn.isVisible()) {
    await clearBtn.click();
    await page.waitForTimeout(400);
  }

  // Scene 1: Welcome & Overview of Line Discounts
  await playScene(0, async () => {
    await spotlight('h1:has-text("POS Billing Counter")');
    await showKeyBadge("LINE DISCOUNTS", "Item-Level Percentage Concessions & Net Recalculation");
    await page.waitForTimeout(2000);

    // Spotlight the search input ready to add items
    await spotlight('input[placeholder*="Search medicine"]');
    await page.waitForTimeout(1800);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Add Medicines & Identify Discount Column
  await playScene(1, async () => {
    const searchInput = page.locator('input[placeholder*="Search medicine"]');

    // Add Item 1: Paracetamol 650 Tab
    await spotlight('input[placeholder*="Search medicine"]');
    await showKeyBadge("F3 / SEARCH", "Add Paracetamol 650 Tab to Cart");
    await page.waitForTimeout(500);

    await searchInput.fill("");
    await searchInput.pressSequentially("Paracetamol", { delay: 50 });
    await page.waitForTimeout(700);

    const firstResult = page.locator(".card.shadow-pop table.data-table tbody tr").first();
    await firstResult.waitFor({ state: "visible", timeout: 5000 });
    await firstResult.click();
    await page.waitForTimeout(600);

    // Add Item 2: Azithromycin 500mg
    await searchInput.fill("");
    await searchInput.pressSequentially("Azithromycin", { delay: 50 });
    await page.waitForTimeout(700);

    const secondResult = page.locator(".card.shadow-pop table.data-table tbody tr").first();
    await secondResult.waitFor({ state: "visible", timeout: 5000 });
    await secondResult.click();
    await page.waitForTimeout(600);

    // Spotlight the Disc % column header and inputs
    await spotlight(".card:has(table.data-table) table.data-table th:has-text('Disc %'), .card:has(table.data-table) table.data-table tbody tr input[placeholder='0%']");
    await showKeyBadge("DISCOUNT COLUMN", "Dedicated Per-Item Discount Percentage Input");
    await page.waitForTimeout(2000);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Apply 10% Discount & Recalculate Line Total
  await playScene(2, async () => {
    const firstDiscountInput = page.locator(".card:has(table.data-table) table.data-table tbody tr input[placeholder='0%']").first();
    await spotlight(".card:has(table.data-table) table.data-table tbody tr:first-child");
    await showKeyBadge("APPLY DISCOUNT", "Enter 10% Concession on First Item");
    await page.waitForTimeout(600);

    await firstDiscountInput.click();
    await firstDiscountInput.fill("10");
    await page.waitForTimeout(800);

    // Spotlight the recalculated line total
    await spotlight(".card:has(table.data-table) table.data-table tbody tr:first-child td:nth-child(8)");
    await showKeyBadge("10% DISCOUNT APPLIED", "Line Total Recalculated · Customer Saving Highlighted");
    await page.waitForTimeout(2000);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Observe Totals Bar & GST Rebalancing
  await playScene(3, async () => {
    // Spotlight the Totals Bar at bottom right
    await spotlight(".card:has-text('Total Payable')");
    await showKeyBadge("TOTALS BAR REBALANCED", "Green Discount Summary · Statutory GST Preserved");
    await page.waitForTimeout(2600);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Split-Tender Checkout Verification & Wrap-Up
  await playScene(4, async () => {
    // Press F8 or click Payment button
    await showKeyBadge("F8 / PAYMENT", "Open Split Tender / Credit Panel");
    const payBtn = page.locator('button:has-text("Split Tender / Credit (F8)")').first();
    if (await payBtn.isVisible()) {
      await payBtn.click();
    } else {
      await page.keyboard.press("F8");
    }
    await page.waitForTimeout(800);

    const paymentModal = page.locator('.card:has(h3:has-text("Payment & Settlement"))');
    await paymentModal.waitFor({ state: "visible", timeout: 5000 });

    // Spotlight the payment modal
    await spotlight('.card:has(h3:has-text("Payment & Settlement"))');
    await showKeyBadge("DISCOUNTED PAYABLE", "Net Payable Reflects Approved Savings");
    await page.waitForTimeout(2400);

    // Close payment modal
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);

    await clearSpotlight();
    await clearKeyBadge();
  });
};
