import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "../../src/server/db/schema";

const testDbUrl =
  process.env.DATABASE_URL ||
  "postgres://mediflow@localhost:5432/mediflow_test";
const pool = new Pool({ connectionString: testDbUrl });
const db = drizzle(pool, { schema });

test.beforeAll(async () => {
  await db
    .update(schema.batches)
    .set({ qtyOnHand: 100 })
    .where(eq(schema.batches.batchNo, "B-PARA-001"));
  await db
    .update(schema.batches)
    .set({ qtyOnHand: 100 })
    .where(eq(schema.batches.batchNo, "B-DOLO-001"));
});

test.afterAll(async () => {
  await pool.end();
});

test.describe("POS Counter E2E Smoke & Hardening Tests", () => {
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

  test("bills 2 medicines with split payment (Cash + UPI), asserts statutory round-off, and verifies database ledger", async ({
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

    // Verify Paracetamol appears in the cart table with correct line rate and total
    const cartTable = page.locator("table.data-table");
    const paraRow = cartTable.locator("tr", { hasText: "Paracetamol 500mg" });
    await expect(paraRow).toBeVisible();
    await expect(paraRow).toContainText("15.00");

    // Item 2: Search & add Dolo 650
    await searchInput.fill("Dolo");
    const addDoloBtn = page.getByRole("button", { name: "+ Add" }).first();
    await expect(addDoloBtn).toBeVisible({ timeout: 10000 });
    await addDoloBtn.click();

    // Verify Dolo appears in the cart table (cart now has 2 items)
    const doloRow = cartTable.locator("tr", { hasText: "Dolo 650" });
    await expect(doloRow).toBeVisible();
    await expect(doloRow).toContainText("30.50");

    // Totals Breakdown verification:
    // Items subtotal: ₹45.50 (₹15.00 + ₹30.50)
    // Round off: +₹0.50
    // Net Payable: ₹46.00
    const totalsArea = page.locator(".card").filter({ hasText: "Total Payable:" });
    await expect(totalsArea).toContainText("45.50");
    await expect(totalsArea).toContainText("46.00");

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

    const currentUrl = page.url();
    const saleIdMatch = currentUrl.match(/\/dashboard\/sales\/([0-9a-fA-F-]{36})/);
    expect(saleIdMatch).toBeTruthy();
    const saleId = saleIdMatch![1];

    // If redirected to thermal print view, click "Back to Invoice"
    if (page.url().includes("/print")) {
      const backLink = page.getByRole("link", { name: /back to invoice/i });
      await expect(backLink).toBeVisible({ timeout: 15000 });
      await backLink.click();
      await page.waitForURL(/\/dashboard\/sales\/[0-9a-fA-F-]+$/, { timeout: 10000 });
    }

    // Invoice Verification:
    // 1. Verify Invoice Header / Invoice Number generated
    const invoiceHeading = page.locator("h1");
    await expect(invoiceHeading).toContainText(/Invoice\s+INV\/\d{2}-\d{2}\/\d{6}/i);

    // 2. Verify Line Items with quantities and rates
    const invoiceTable = page.locator("table.data-table");
    const invParaRow = invoiceTable.locator("tr", { hasText: "Paracetamol 500mg" });
    await expect(invParaRow).toBeVisible();
    await expect(invParaRow).toContainText("15.00");

    const invDoloRow = invoiceTable.locator("tr", { hasText: "Dolo 650" });
    await expect(invDoloRow).toBeVisible();
    await expect(invDoloRow).toContainText("30.50");

    // 3. Verify Financial Totals breakdown (Gross ₹45.50, Round off +₹0.50, Net ₹46.00)
    await expect(page.locator("body")).toContainText("45.50");
    await expect(page.locator("body")).toContainText("46.00");

    // 4. Verify Payment Status & Split Tender breakdown
    const splitPaymentsBanner = page.getByTestId("split-payments");
    await expect(splitPaymentsBanner).toBeVisible();
    await expect(splitPaymentsBanner).toContainText(/CASH:\s*₹20\.00/i);
    await expect(splitPaymentsBanner).toContainText(/UPI:\s*₹26\.00/i);

    // 5. Database Persistence Verification: Reload the invoice page
    await page.reload();
    await expect(invoiceHeading).toContainText(/Invoice\s+INV\/\d{2}-\d{2}\/\d{6}/i);
    await expect(page.getByText("Paracetamol 500mg")).toBeVisible();
    await expect(page.getByText("Dolo 650")).toBeVisible();
    await expect(splitPaymentsBanner).toContainText(/CASH:\s*₹20\.00/i);
    await expect(splitPaymentsBanner).toContainText(/UPI:\s*₹26\.00/i);

    // 6. Direct PostgreSQL Ledger Verification (proves real DB persistence and inventory decrement)
    const [persistedSale] = await db
      .select()
      .from(schema.sales)
      .where(eq(schema.sales.id, saleId));

    expect(persistedSale).toBeDefined();
    expect(persistedSale.status).toBe("completed");
    expect(persistedSale.totalAmount).toBe(4600); // ₹46.00
    expect(persistedSale.grossAmount).toBe(4550); // ₹45.50
    expect(persistedSale.roundOff).toBe(50); // +₹0.50
    expect(persistedSale.paidAmount).toBe(4600);

    // Verify Sale Payments
    const payments = await db
      .select()
      .from(schema.salePayments)
      .where(eq(schema.salePayments.saleId, saleId));
    expect(payments.length).toBe(2);
    const cashP = payments.find((p) => p.method === "cash");
    const upiP = payments.find((p) => p.method === "upi");
    expect(cashP?.amount).toBe(2000); // ₹20.00
    expect(upiP?.amount).toBe(2600); // ₹26.00

    // Verify Inventory Batch Quantities Decremented:
    // Opening: 100 units each.
    // Paracetamol: 1 strip (10 units) sold -> 90 remaining.
    // Dolo 650: 1 strip (15 units) sold -> 85 remaining.
    const [paraBatch] = await db
      .select()
      .from(schema.batches)
      .where(eq(schema.batches.batchNo, "B-PARA-001"));
    expect(paraBatch).toBeDefined();
    expect(paraBatch.qtyOnHand).toBe(90);

    const [doloBatch] = await db
      .select()
      .from(schema.batches)
      .where(eq(schema.batches.batchNo, "B-DOLO-001"));
    expect(doloBatch).toBeDefined();
    expect(doloBatch.qtyOnHand).toBe(85);

    // Verify Stock Movements recorded with type "sale" and refId = saleId
    const movements = await db
      .select()
      .from(schema.stockMovements)
      .where(eq(schema.stockMovements.refId, saleId));
    expect(movements.length).toBe(2);
    expect(
      movements.some((m) => m.qtyChange === -10 && m.balanceAfter === 90 && m.type === "sale")
    ).toBe(true);
    expect(
      movements.some((m) => m.qtyChange === -15 && m.balanceAfter === 85 && m.type === "sale")
    ).toBe(true);
  });

  test("supports dual ergonomics: F8 opens modal, Esc dismisses, and F10 keyboard accelerator finalizes sale", async ({
    page,
  }) => {
    const [initialPara] = await db
      .select({ qty: schema.batches.qtyOnHand })
      .from(schema.batches)
      .where(eq(schema.batches.batchNo, "B-PARA-001"));
    const expectedQty = (initialPara?.qty ?? 90) - 10;

    // Navigate to POS Counter
    await page.goto("/dashboard/sales/pos");
    const searchInput = page.getByPlaceholder(/search medicine/i);
    await expect(searchInput).toBeVisible({ timeout: 10000 });

    const modalHeading = page.getByRole("heading", {
      name: /Payment & Settlement/i,
    });

    // 1. Verify F8 opens modal & Escape dismisses modal (toPass absorbs hydration delay)
    await searchInput.focus();
    await expect(async () => {
      await page.keyboard.press("F8");
      await expect(modalHeading).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 15000 });

    await page.keyboard.press("Escape");
    await expect(modalHeading).not.toBeVisible({ timeout: 10000 });

    // 2. Add Paracetamol to cart (1 strip, 10 units @ ₹15.00)
    await searchInput.fill("Paracetamol");
    const addParaBtn = page.getByRole("button", { name: "+ Add" }).first();
    await expect(addParaBtn).toBeVisible({ timeout: 10000 });
    await addParaBtn.click();

    const cartTable = page.locator("table.data-table");
    await expect(cartTable.getByText("Paracetamol 500mg")).toBeVisible();

    // 3. Press F10 accelerator to complete sale
    await page.keyboard.press("F10");

    // Expect navigation away from POS to the created sale's invoice or print page
    await page.waitForURL(/\/dashboard\/sales\/[0-9a-fA-F-]{36}(\/print.*)?/, { timeout: 20000 });

    const currentUrl = page.url();
    const f10SaleIdMatch = currentUrl.match(/\/dashboard\/sales\/([0-9a-fA-F-]{36})/);
    expect(f10SaleIdMatch).toBeTruthy();
    const f10SaleId = f10SaleIdMatch![1];

    if (page.url().includes("/print")) {
      const backLink = page.getByRole("link", { name: /back to invoice/i });
      await expect(backLink).toBeVisible({ timeout: 15000 });
      await backLink.click();
      await page.waitForURL(/\/dashboard\/sales\/[0-9a-fA-F-]+$/, { timeout: 10000 });
    }

    // Verify invoice created via F10 shortcut
    const invoiceHeading = page.locator("h1");
    await expect(invoiceHeading).toContainText(/Invoice\s+INV\/\d{2}-\d{2}\/\d{6}/i);
    await expect(page.getByText("Paracetamol 500mg")).toBeVisible();
    await expect(page.getByText("Fully Paid")).toBeVisible();
    await expect(page.locator("body")).toContainText("15.00");

    // 4. Direct DB verification of second sale:
    const [paraBatch] = await db
      .select()
      .from(schema.batches)
      .where(eq(schema.batches.batchNo, "B-PARA-001"));
    expect(paraBatch).toBeDefined();
    expect(paraBatch.qtyOnHand).toBe(expectedQty);

    const f10Movements = await db
      .select()
      .from(schema.stockMovements)
      .where(eq(schema.stockMovements.refId, f10SaleId));
    expect(f10Movements.length).toBe(1);
    expect(f10Movements[0].qtyChange).toBe(-10);
    expect(f10Movements[0].balanceAfter).toBe(expectedQty);
    expect(f10Movements[0].type).toBe("sale");
  });
});
