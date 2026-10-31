import { test, expect } from "@playwright/test";

test.describe("POS Counter E2E Smoke Tests", () => {
  test.beforeEach(async ({ page }) => {
    // 1. Visit Login Page
    await page.goto("/login");
    await expect(page).toHaveTitle(/MediFlow/i);

    // 2. Perform Authentication
    await page.fill('input[name="email"]', "admin@apollo.com");
    await page.fill('input[name="password"]', "admin123");
    await page.getByRole("button", { name: /sign in/i }).click();

    // 3. Confirm Dashboard Redirection
    await page.waitForURL("**/dashboard**", { timeout: 15000 });
    await expect(page.locator("body")).toBeVisible();
  });

  test("bills 2 medicines with split payment (Cash + UPI) and verifies persisted invoice", async ({
    page,
  }) => {
    // Navigate to POS Counter
    await page.goto("/dashboard/sales/pos");
    const searchInput = page.getByPlaceholder(/search medicine/i);
    await expect(searchInput).toBeVisible({ timeout: 10000 });

    // Item 1: Search & add Paracetamol 500mg
    await searchInput.fill("Paracetamol");
    const addParaBtn = page.getByRole("button", { name: "+ Add" }).first();
    await expect(addParaBtn).toBeVisible({ timeout: 10000 });
    await addParaBtn.click();

    // Verify Paracetamol appears in the cart table
    const cartTable = page.locator("table.data-table");
    await expect(cartTable.getByText("Paracetamol 500mg")).toBeVisible();

    // Item 2: Search & add Dolo 650
    await searchInput.fill("Dolo");
    const addDoloBtn = page.getByRole("button", { name: "+ Add" }).first();
    await expect(addDoloBtn).toBeVisible({ timeout: 10000 });
    await addDoloBtn.click();

    // Verify Dolo appears in the cart table (cart now has 2 items)
    await expect(cartTable.getByText("Dolo 650")).toBeVisible();

    // Total should be ₹45.50 (₹15.00 + ₹30.50)
    const totalsArea = page.locator(".card").filter({ hasText: "Total Payable:" });
    await expect(totalsArea).toContainText("45.50");

    // Open Split Tender Modal (F8 / button click)
    const splitTenderBtn = page.getByRole("button", {
      name: /split tender/i,
    });
    await expect(splitTenderBtn).toBeVisible();
    await splitTenderBtn.click();

    // Verify Split Tender Modal is open
    const modalHeading = page.getByRole("heading", {
      name: /Payment & Settlement/i,
    });
    await expect(modalHeading).toBeVisible();

    // Enter split payments: ₹20.00 Cash + ₹26.00 UPI (totaling ₹46.00 including statutory round-off)
    const cashInput = page.getByLabel("Cash tender amount");
    await cashInput.fill("20.00");

    const upiInput = page.getByLabel("UPI tender amount");
    await upiInput.fill("26.00");

    // Confirm total tendered is ₹46.00 and no remaining due
    const modal = page.locator(".card").filter({ hasText: "Payment & Settlement" });
    await expect(modal.getByTestId("net-payable-amount")).toContainText("46.00");

    // Finalize Sale via Complete Sale button inside modal
    const completeSaleBtn = modal.getByRole("button", {
      name: /complete sale/i,
    });
    await completeSaleBtn.click();

    // Expect navigation away from POS to the created sale's invoice or print page
    await page.waitForURL(/\/dashboard\/sales\/[0-9a-fA-F-]{36}(\/print.*)?/, { timeout: 20000 });

    // If redirected to thermal print view, click "Back to Invoice"
    if (page.url().includes("/print")) {
      const backLink = page.getByRole("link", { name: /back to invoice/i });
      await expect(backLink).toBeVisible();
      await backLink.click();
      await page.waitForURL(/\/dashboard\/sales\/[0-9a-fA-F-]+$/, { timeout: 10000 });
    }

    // Invoice Verification:
    // 1. Verify Invoice Header / Invoice Number generated
    const invoiceHeading = page.locator("h1");
    await expect(invoiceHeading).toContainText(/Invoice\s+INV/i);

    // 2. Verify Line Items
    await expect(page.getByText("Paracetamol 500mg")).toBeVisible();
    await expect(page.getByText("Dolo 650")).toBeVisible();

    // 3. Verify Payment Status & Split Tender breakdown
    const splitPaymentsBanner = page.getByTestId("split-payments");
    await expect(splitPaymentsBanner).toBeVisible();
    await expect(splitPaymentsBanner).toContainText(/CASH:\s*₹20\.00/i);
    await expect(splitPaymentsBanner).toContainText(/UPI:\s*₹26\.00/i);

    // 4. Verify Total Amount
    await expect(page.locator("body")).toContainText("46.00");

    // 5. Database Persistence Verification: Reload the invoice page
    await page.reload();
    await expect(invoiceHeading).toContainText(/Invoice\s+INV/i);
    await expect(page.getByText("Paracetamol 500mg")).toBeVisible();
    await expect(page.getByText("Dolo 650")).toBeVisible();
    await expect(splitPaymentsBanner).toContainText(/CASH:\s*₹20\.00/i);
    await expect(splitPaymentsBanner).toContainText(/UPI:\s*₹26\.00/i);
  });

  test("supports dual ergonomics: F8 keyboard accelerator opens and Esc dismisses payment modal", async ({
    page,
  }) => {
    // Navigate to POS Counter
    await page.goto("/dashboard/sales/pos");
    const searchInput = page.getByPlaceholder(/search medicine/i);
    await expect(searchInput).toBeVisible({ timeout: 10000 });

    const modalHeading = page.getByRole("heading", {
      name: /Payment & Settlement/i,
    });

    // Press F8 to open Payment Modal
    await page.keyboard.press("F8");
    await expect(modalHeading).toBeVisible({ timeout: 5000 });

    // Press Escape to dismiss Payment Modal
    await page.keyboard.press("Escape");
    await expect(modalHeading).not.toBeVisible({ timeout: 5000 });
  });
});
