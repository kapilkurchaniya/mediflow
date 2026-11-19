import type { ScenarioRunner } from "./types";

export const runVID2_5: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  // Navigate to POS billing counter
  console.log("Loading POS billing counter for Split-Tender Payments scenario...");
  await page.goto(`${baseUrl}/dashboard/sales/pos`);
  await page.waitForSelector('input[placeholder*="Search medicine"]', { timeout: 10000 });
  await page.waitForTimeout(500);

  // Scene 1: Welcome & Overview of Multi-Tender Payments
  await playScene(0, async () => {
    await spotlight('h1:has-text("POS Billing Counter")');
    await showKeyBadge("SPLIT-TENDER", "Cash, UPI QR & Card Billing");
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
      await page.waitForTimeout(1000);
    }

    // Add Paracetamol (5 packs = ₹150 total)
    const searchInput = page.locator('input[placeholder*="Search medicine"]');
    await searchInput.fill("");
    await searchInput.pressSequentially("Paracetamol", { delay: 60 });
    await searchInput.press("Enter");
    const firstResult = page.locator(".card.shadow-pop table.data-table tbody tr").first();
    await firstResult.waitFor({ state: "visible", timeout: 6000 });
    await firstResult.click();
    await page.waitForTimeout(600);

    // Set Packs to 5
    const cartRow = page.locator(".card table.data-table tbody tr").first();
    const packInput = cartRow.locator('input[type="number"]').first();
    await packInput.click();
    await packInput.fill("5");
    await page.waitForTimeout(800);

    // Spotlight the Net Payable total (₹150.00)
    await spotlight('.card:has-text("Total Payable")');
    await showKeyBadge("BILL TOTAL: ₹150.00", "5 Strips of Paracetamol");
    await page.waitForTimeout(2000);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Open Split Tender Modal with F8
  await playScene(1, async () => {
    // Spotlight Split Tender button in TotalsBar
    const splitBtn = page.locator('button:has-text("Split Tender")');
    await spotlight('button:has-text("Split Tender")');
    await showKeyBadge("F8", "Open Multi-Payment Panel");
    await page.waitForTimeout(1200);

    // Press F8 (or click button)
    await page.keyboard.press("F8");
    const modalHeader = page.locator('h3:has-text("Payment & Settlement")');
    await modalHeader.waitFor({ state: "visible", timeout: 5000 }).catch(async () => {
      if (await splitBtn.isVisible()) {
        await splitBtn.click();
        await modalHeader.waitFor({ state: "visible", timeout: 5000 });
      }
    });
    await page.waitForTimeout(500);

    // Spotlight the modal
    await spotlight('.card:has(h3:has-text("Payment & Settlement"))');
    await showKeyBadge("PAYMENT PANEL", "Cash · UPI · Debit Card");
    await page.waitForTimeout(2400);

    await clearKeyBadge();
  });

  // Scene 3: Cash Tender & Automated Change Due (₹500 note given)
  await playScene(2, async () => {
    const cashInput = page.locator('input[aria-label="Cash tender amount"]');
    await spotlight('div:has(> input[aria-label="Cash tender amount"])');
    await showKeyBadge("PATIENT TENDERS ₹500", "₹150 Bill Amount");
    await page.waitForTimeout(1000);

    // Fill 500 into cash
    await cashInput.click();
    await cashInput.fill("500");
    await page.waitForTimeout(800);

    // Spotlight the green change due indicator
    const changeDueCard = page.locator('.bg-emerald-50:has-text("Change to Return")');
    if (await changeDueCard.isVisible()) {
      await spotlight('.bg-emerald-50:has-text("Change to Return")');
    }
    await showKeyBadge("CHANGE DUE: ₹350.00", "Exact Cash Return Prompt");
    await page.waitForTimeout(2800);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Split Payment: ₹50 Cash + ₹100 UPI QR Code
  await playScene(3, async () => {
    const cashInput = page.locator('input[aria-label="Cash tender amount"]');
    const upiInput = page.locator('input[aria-label="UPI tender amount"]');

    // Change Cash to 50
    await cashInput.click();
    await cashInput.fill("50");
    await page.waitForTimeout(600);

    // Enter 100 in UPI
    await upiInput.click();
    await upiInput.fill("100");
    await page.waitForTimeout(800);

    // Spotlight tender totals
    await spotlight('.card:has(h3:has-text("Payment & Settlement")) .border-t');
    await showKeyBadge("SPLIT: ₹50 CASH + ₹100 UPI", "Total Tendered: ₹150.00");
    await page.waitForTimeout(2600);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Complete Sale & Outro
  await playScene(4, async () => {
    // Spotlight Complete Sale button inside modal
    const completeModalBtn = page.locator('.card:has(h3:has-text("Payment & Settlement")) button:has-text("Complete Sale")');
    await spotlight('.card:has(h3:has-text("Payment & Settlement")) button:has-text("Complete Sale")');
    await showKeyBadge("F10", "Finalize & Print Invoice");
    await page.waitForTimeout(1400);

    // Click Complete Sale
    await completeModalBtn.click();

    // Wait for print receipt page navigation
    await page.waitForURL("**/print**", { timeout: 8000 }).catch(() => {});
    const printReceipt = page.locator("#invoice-printable");
    await printReceipt.waitFor({ state: "visible", timeout: 6000 }).catch(() => {});
    if (await printReceipt.isVisible()) {
      await spotlight("#invoice-printable");
    }

    await showKeyBadge("INVOICE ISSUED", "Multi-Tender Breakdown Logged");
    await page.waitForTimeout(3000);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Cleanup
  await clearSpotlight();
  await clearKeyBadge();
  await page.waitForTimeout(300);
};
