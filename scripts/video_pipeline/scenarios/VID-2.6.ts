import type { ScenarioRunner } from "./types";

export const runVID2_6: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  // Navigate to POS billing counter
  console.log("Loading POS billing counter for Customer Credit ('Khata') scenario...");
  await page.goto(`${baseUrl}/dashboard/sales/pos`);
  await page.waitForSelector('input[placeholder*="Search medicine"]', { timeout: 10000 });
  await page.waitForTimeout(500);

  // Clear existing cart or customer if present from previous run
  const clearBtn = page.locator('button[title*="New bill"]');
  if (await clearBtn.isVisible()) {
    await clearBtn.click();
    await page.waitForTimeout(400);
  }
  const removeCustBtn = page.locator('button[title="Remove customer"]');
  if (await removeCustBtn.isVisible()) {
    await removeCustBtn.click();
    await page.waitForTimeout(400);
  }

  // Scene 1: Welcome & Overview of Customer Credit / Khata
  await playScene(0, async () => {
    await spotlight('h1:has-text("POS Billing Counter")');
    await showKeyBadge("CUSTOMER CREDIT ('KHATA')", "Monthly Ledger & Credit Limit Safeguards");
    await page.waitForTimeout(2000);

    // Spotlight the Customer & Loyalty card on the right
    await spotlight('.card:has-text("Customer & Loyalty")');
    await page.waitForTimeout(2400);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Attach Registered Customer (Ramesh Kumar)
  await playScene(1, async () => {
    const custInput = page.locator('input[placeholder*="Search customer"]');
    await spotlight('input[placeholder*="Search customer"]');
    await showKeyBadge("ATTACH CUSTOMER", "Search Ramesh Kumar (9876543210)");
    await page.waitForTimeout(1000);

    await custInput.fill("");
    await custInput.pressSequentially("Ramesh", { delay: 65 });
    await page.waitForTimeout(600);

    // Spotlight the dropdown options
    const dropdown = page.locator('.card:has-text("Customer & Loyalty") .shadow-pop');
    await dropdown.waitFor({ state: "visible", timeout: 5000 });
    await spotlight('.card:has-text("Customer & Loyalty") .shadow-pop');
    await page.waitForTimeout(1200);

    // Click Ramesh Kumar
    const rameshItem = page.locator('.card:has-text("Customer & Loyalty") .shadow-pop button:has-text("Ramesh")').first();
    await rameshItem.click();
    await page.waitForTimeout(800);

    // Spotlight the customer card showing profile details
    await spotlight('.card:has-text("Customer & Loyalty") div:has(> .font-bold:has-text("Ramesh"))');
    await showKeyBadge("SANCTIONED LIMIT: ₹5,000", "Approved Monthly Credit Khata");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Add Items to Cart & Open Settlement Panel (F8)
  await playScene(2, async () => {
    // Add Paracetamol
    const searchInput = page.locator('input[placeholder*="Search medicine"]');
    await spotlight('input[placeholder*="Search medicine"]');
    await showKeyBadge("ADD MEDICINES", "Paracetamol 650 (2 Strips)");
    await page.waitForTimeout(800);

    await searchInput.fill("");
    await searchInput.pressSequentially("Paracetamol", { delay: 60 });
    await searchInput.press("Enter");
    const firstResult = page.locator(".card.shadow-pop table.data-table tbody tr").first();
    await firstResult.waitFor({ state: "visible", timeout: 6000 });
    await firstResult.click();
    await page.waitForTimeout(600);

    // Set Packs to 2
    const cartRow = page.locator(".card table.data-table tbody tr").first();
    const packInput = cartRow.locator('input[type="number"]').first();
    await packInput.click();
    await packInput.fill("2");
    await page.waitForTimeout(800);

    // Spotlight Net Payable in TotalsBar
    await spotlight('.card:has-text("Total Payable")');
    await showKeyBadge("NET PAYABLE: ₹60.00", "Total Medicine Bill");
    await page.waitForTimeout(1400);

    // Spotlight Split Tender / Credit button
    const creditBtn = page.locator('button:has-text("Split Tender")');
    await spotlight('button:has-text("Split Tender")');
    await showKeyBadge("F8", "Open Settlement & Credit Panel");
    await page.waitForTimeout(1200);

    // Open modal via F8 / button
    await page.keyboard.press("F8");
    const modalHeader = page.locator('h3:has-text("Payment & Settlement")');
    await modalHeader.waitFor({ state: "visible", timeout: 5000 }).catch(async () => {
      if (await creditBtn.isVisible()) {
        await creditBtn.click();
        await modalHeader.waitFor({ state: "visible", timeout: 5000 });
      }
    });
    await page.waitForTimeout(600);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Unpaid Amount Automatically Handled as Customer Credit
  await playScene(3, async () => {
    // Spotlight the modal
    await spotlight('.card:has(h3:has-text("Payment & Settlement"))');
    await showKeyBadge("PAYMENT SETTLEMENT", "Cash: ₹0 · UPI: ₹0 · Card: ₹0");
    await page.waitForTimeout(1500);

    // Spotlight the Customer Credit (Unpaid) amber box
    const creditDueBox = page.locator('div:has-text("Customer Credit (Unpaid)")').last();
    if (await creditDueBox.isVisible()) {
      await spotlight('div:has-text("Customer Credit (Unpaid)")');
    }
    await showKeyBadge("KHATA CREDIT: ₹60.00", "Billed to Ramesh Kumar's Ledger");
    await page.waitForTimeout(3000);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Credit Limit Safeguards & Finalize Sale (F10)
  await playScene(4, async () => {
    const completeBtn = page.locator('button:has-text("Complete Sale")');
    await spotlight('button:has-text("Complete Sale")');
    await showKeyBadge("F10 · COMPLETE SALE", "Strict Limit Check · Instant Ledger Entry");
    await page.waitForTimeout(1800);

    // Click Complete Sale
    await completeBtn.click();

    // Wait for thermal receipt page
    await page.waitForSelector('#invoice-printable, text=Tax Invoice, text=Customer', { timeout: 8000 }).catch(() => null);
    await page.waitForTimeout(1000);

    // Spotlight thermal receipt if present
    const printable = page.locator('#invoice-printable');
    if (await printable.isVisible()) {
      await spotlight('#invoice-printable');
      await showKeyBadge("INVOICE GENERATED", "Credit Sale Recorded to Khata");
      await page.waitForTimeout(2500);
    }

    await clearSpotlight();
    await clearKeyBadge();
  });
};
