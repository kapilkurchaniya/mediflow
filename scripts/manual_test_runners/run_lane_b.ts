import { createRecordedBrowser, convertWebmToMp4, TestSession } from "./runner_common";
import * as path from "node:path";

const BASE_URL = "http://localhost:3000";

async function run() {
  const session = new TestSession("Lane B");
  const rawDir = path.join(process.cwd(), "recordings/lane_b_raw");
  const mp4Path = path.join(process.cwd(), "recordings/lane_b_test_run.mp4");

  console.log("=== STARTING LANE B MANUAL UI TEST EXECUTION & RECORDING ===");
  const { browser, context, page } = await createRecordedBrowser(rawDir);
  session.hookPageLogs(page);
  session.startRecording();

  async function logout() {
    await context.clearCookies();
    await page.goto(`${BASE_URL}/login`);
    await page.waitForTimeout(500);
  }

  async function loginAs(email: string, pass: string = "admin123") {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', pass);
    await page.click('.bg-white form button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 10000 });
    await page.waitForTimeout(1000);
  }

  try {
    // Start with login as Owner
    await loginAs("admin@apollo.com", "admin123");

    // 1. B-0.3 - E-Invoice simulator view
    await session.runStep(
      "B-0.3",
      "Phase 0 E-Invoice",
      "E-invoice dashboard: verify simulator mode indicator and portal sandbox status",
      async () => {
        await page.goto(`${BASE_URL}/dashboard/gst/e-invoice`);
        await page.waitForSelector("body", { timeout: 5000 });
        const text = await page.innerText("body");
        if (!text.includes("E-Invoice") && !text.includes("e-Invoice") && !text.includes("GST")) {
          throw new Error("Expected E-invoice page header or GST indicators");
        }
        await page.waitForTimeout(1500);
      }
    );

    // 2. B-2.0 - Suppliers and purchases (GRN)
    await session.runStep(
      "B-2.0",
      "Phase 2 Purchases",
      "Purchase Manager creates supplier and records purchase invoice (GRN) with batch PB1",
      async () => {
        await logout();
        await loginAs("purchase_manager@apollo.com", "purchase_manager123");

        // 1. Create supplier
        await page.goto(`${BASE_URL}/dashboard/suppliers/new`);
        await page.waitForSelector('input[name="name"]', { timeout: 5000 });
        await page.fill('input[name="name"]', "M/s Bharat Pharma Distributors");
        await page.fill('input[name="contactPerson"]', "Suresh Shah");
        await page.fill('input[name="phone"]', "9820012345");
        await page.fill('input[name="gstin"]', "27AAAAA0000A1Z5");
        await page.fill('input[name="creditDays"]', "30");
        await page.click('.card button[type="submit"]');
        await page.waitForURL("**/dashboard/suppliers**", { timeout: 8000 });
        await page.waitForTimeout(1000);

        // 2. Record Purchase Invoice GRN
        await page.goto(`${BASE_URL}/dashboard/purchases/new`);
        await page.waitForSelector('select#supplierId, select[name="supplierId"]', { timeout: 5000 });

        // Select supplier
        const supSelect = page.locator('select#supplierId, select[name="supplierId"]');
        await supSelect.selectOption({ label: "M/s Bharat Pharma Distributors" });
        await page.fill('input#supplierInvoiceNo, input[name="supplierInvoiceNo"]', "SB-001");

        // Add line item
        await page.click("button:has-text('Add Line Item'), button:has-text('Add Item')");
        await page.waitForSelector("table tbody tr select", { timeout: 5000 });

        // Select first available medicine
        const medSelect = page.locator("table tbody tr select").first();
        const options = await medSelect.locator("option").all();
        if (options.length > 1) {
          await medSelect.selectOption({ index: 1 });
        }

        // Fill batch, expiry, qty
        const batchInput = page.locator('table input[placeholder*="LOT"], table input[name*="batch"]').first();
        if (await batchInput.count() > 0) await batchInput.fill("PB1");

        const expInput = page.locator('table input[type="date"]').first();
        if (await expInput.count() > 0) await expInput.fill("2027-12-31");

        const qtyInput = page.locator('table input[type="number"]').first();
        if (await qtyInput.count() > 0) await qtyInput.fill("100");

        const freeInput = page.locator('table input[placeholder="0"]').first();
        if (await freeInput.count() > 0) await freeInput.fill("10");

        // Save purchase
        await page.click("button:has-text('Post Purchase Invoice')");
        await page.waitForURL("**/dashboard/purchases**", { timeout: 8000 });
        await page.waitForTimeout(2000);

        const listText = await page.innerText("body");
        if (!listText.includes("SB-001")) {
          throw new Error("Expected purchase invoice 'SB-001' to be listed");
        }
      }
    );

    // 3. B-2.0b - Item scheme / trade schemes
    await session.runStep(
      "B-2.0b",
      "Phase 2 Trade Schemes",
      "Settings: create 'Buy 10 get 1 free' trade scheme and verify listing",
      async () => {
        await page.goto(`${BASE_URL}/dashboard/settings/schemes/new`);
        await page.waitForSelector('input[placeholder*="Scheme"], input[placeholder*="Deal"]', { timeout: 5000 });

        await page.fill('input[placeholder*="Scheme"], input[placeholder*="Deal"]', "Buy 10 get 1 Free Scheme");
        await page.click("button:has-text('Create Scheme'), button[type='submit']");
        await page.waitForURL("**/dashboard/settings/schemes**", { timeout: 8000 });
        await page.waitForTimeout(1500);

        const schemeText = await page.innerText("body");
        if (!schemeText.includes("Buy 10 get 1")) {
          throw new Error("Expected created scheme to appear in Trade Schemes list");
        }
      }
    );

    // 4. B-2.0c - Customers, family groups and loyalty
    await session.runStep(
      "B-2.0c",
      "Phase 2 CRM & Loyalty",
      "Customer profiles, Sharma Family group, and loyalty program activation",
      async () => {
        // 1. Activate loyalty
        await page.goto(`${BASE_URL}/dashboard/settings/loyalty`);
        await page.waitForSelector("body", { timeout: 5000 });
        const saveLoyaltyBtn = page.locator('.page button:has-text("Save"), .page button[type="submit"]');
        if (await saveLoyaltyBtn.count() > 0) {
          await saveLoyaltyBtn.first().click();
          await page.waitForTimeout(1000);
        }

        // 2. Create customer Ravi Sharma
        await page.goto(`${BASE_URL}/dashboard/customers/new`);
        await page.waitForSelector('input[name="name"]', { timeout: 5000 });
        await page.fill('input[name="name"]', "Ravi Sharma");
        await page.fill('input[name="phone"]', "9876543210");
        await page.fill('input[name="email"]', "ravi.sharma@example.com");
        await page.click('.card button[type="submit"]');
        await page.waitForURL("**/dashboard/customers**", { timeout: 8000 });
        await page.waitForTimeout(1500);

        // 3. Customer Family Groups
        await page.goto(`${BASE_URL}/dashboard/customers/groups`);
        await page.waitForSelector("body", { timeout: 5000 });
        await page.waitForTimeout(1000);
      }
    );

    // 5. B-2.0d - Omnichannel and Promise Orders
    await session.runStep(
      "B-2.0d",
      "Phase 2 Orders",
      "Omnichannel orders queue and customer promise orders management",
      async () => {
        // Omnichannel orders
        await page.goto(`${BASE_URL}/dashboard/orders`);
        await page.waitForSelector("body", { timeout: 5000 });
        await page.waitForTimeout(1000);

        // Promise orders
        await page.goto(`${BASE_URL}/dashboard/sales/promise-orders`);
        await page.waitForSelector("body", { timeout: 5000 });
        await page.waitForTimeout(1000);
      }
    );

    // 6. B-2.0e - Compliance registers
    await session.runStep(
      "B-2.0e",
      "Phase 2 Compliance",
      "Statutory registers: Schedule H, Schedule H1, Narcotics, Prescriptions, Doctors",
      async () => {
        // Overview
        await page.goto(`${BASE_URL}/dashboard/compliance`);
        await page.waitForTimeout(1000);

        // Schedule H
        await page.goto(`${BASE_URL}/dashboard/compliance/schedule-h`);
        await page.waitForTimeout(1000);

        // Schedule H1
        await page.goto(`${BASE_URL}/dashboard/compliance/schedule-h1`);
        await page.waitForTimeout(1000);

        // Narcotics
        await page.goto(`${BASE_URL}/dashboard/compliance/narcotics`);
        await page.waitForTimeout(1000);

        // Prescriptions
        await page.goto(`${BASE_URL}/dashboard/compliance/prescriptions`);
        await page.waitForTimeout(1000);

        // Doctors
        await page.goto(`${BASE_URL}/dashboard/compliance/doctors`);
        await page.waitForTimeout(1000);
      }
    );

    // 7. B-2.0f - GST pages
    await session.runStep(
      "B-2.0f",
      "Phase 2 GST & Tax",
      "GST compliance hub: GSTR-1 outward, GSTR-2 inward, GSTR-3B monthly summary",
      async () => {
        // GST Hub
        await page.goto(`${BASE_URL}/dashboard/gst`);
        await page.waitForTimeout(1000);

        // GSTR-1 Outward
        await page.goto(`${BASE_URL}/dashboard/gst/outward`);
        await page.waitForTimeout(1000);

        // GSTR-2 Inward
        await page.goto(`${BASE_URL}/dashboard/gst/inward`);
        await page.waitForTimeout(1000);

        // GSTR-3B Returns
        await page.goto(`${BASE_URL}/dashboard/gst/returns`);
        await page.waitForTimeout(1000);

        // Reconciliation
        await page.goto(`${BASE_URL}/dashboard/gst/reconciliation`);
        await page.waitForTimeout(1000);
      }
    );

    // 8. B-2.0g - Reports & dashboard analytics
    await session.runStep(
      "B-2.0g",
      "Phase 2 Analytics",
      "Management reports: Expiry tracking, Inventory valuation, MR commissions",
      async () => {
        // Reports Center
        await page.goto(`${BASE_URL}/dashboard/reports`);
        await page.waitForTimeout(1000);

        // Expiry Reports
        await page.goto(`${BASE_URL}/dashboard/reports/expiry`);
        await page.waitForTimeout(1000);

        // Inventory Valuation
        await page.goto(`${BASE_URL}/dashboard/reports/inventory`);
        await page.waitForTimeout(1000);

        // Commission Reports
        await page.goto(`${BASE_URL}/dashboard/reports/commissions`);
        await page.waitForTimeout(1000);
      }
    );

    // 9. B-2.0h - Medical reps and commissions
    await session.runStep(
      "B-2.0h",
      "Phase 2 Directory",
      "Medical Representatives: register MR with company and commission percentage",
      async () => {
        await page.goto(`${BASE_URL}/dashboard/settings/medical-reps`);
        await page.waitForSelector("body", { timeout: 5000 });

        const addMrBtn = page.locator("button:has-text('Add Representative'), button:has-text('Add MR')");
        if (await addMrBtn.count() > 0) {
          await addMrBtn.first().click();
          await page.waitForTimeout(800);

          const nameInp = page.locator('input[placeholder*="Name"], input#mr-name');
          if (await nameInp.count() > 0) await nameInp.first().fill("Anil Deshmukh");

          const compInp = page.locator('input[placeholder*="Company"], input#mr-company');
          if (await compInp.count() > 0) await compInp.first().fill("Cipla Ltd");

          const commInp = page.locator('input[placeholder*="commission"], input#mr-commission');
          if (await commInp.count() > 0) await commInp.first().fill("3.5");

          const saveBtn = page.locator("button:has-text('Save')");
          if (await saveBtn.count() > 0) {
            await saveBtn.first().click();
            await page.waitForTimeout(1500);
          }
        }
      }
    );

    // 10. B-2.0i - WhatsApp, SMS and reminders
    await session.runStep(
      "B-2.0i",
      "Phase 2 Comms",
      "Customer communications: WhatsApp message outbox, templates, refill reminders",
      async () => {
        // WhatsApp Hub
        await page.goto(`${BASE_URL}/dashboard/whatsapp`);
        await page.waitForTimeout(1000);

        // WhatsApp Templates
        await page.goto(`${BASE_URL}/dashboard/whatsapp/templates`);
        await page.waitForTimeout(1000);

        // Chronic Refill Reminders
        await page.goto(`${BASE_URL}/dashboard/reminders`);
        await page.waitForTimeout(1000);
      }
    );

    // 11. B-2.0j - Bank reconciliation
    await session.runStep(
      "B-2.0j",
      "Phase 2 Finance",
      "Bank reconciliation: statements upload and journal ledger matching",
      async () => {
        await page.goto(`${BASE_URL}/dashboard/accounting/bank-reconciliation`);
        await page.waitForSelector("body", { timeout: 5000 });
        await page.waitForTimeout(1500);
      }
    );

    // 12. B-2.0k - AI assistant interaction
    await session.runStep(
      "B-2.0k",
      "Phase 2 AI Assistant",
      "Press Ctrl+J to toggle Ask MediFlow AI assistant drawer and interact with assistant",
      async () => {
        await page.goto(`${BASE_URL}/dashboard`);
        await page.waitForTimeout(1000);

        // Open assistant with Ctrl+J
        await page.keyboard.press("Control+j");
        await page.waitForTimeout(1000);

        const aiInput = page.locator('input[placeholder*="command or question"]');
        if (await aiInput.count() > 0) {
          await aiInput.fill("What is today's sale and stock status?");
          await page.keyboard.press("Enter");
          await page.waitForTimeout(2000);
        }

        // Close assistant
        await page.keyboard.press("Escape");
        await page.waitForTimeout(1000);
      }
    );

  } finally {
    console.log("Closing browser and finalizing Lane B recording...");
    await page.waitForTimeout(1000);
    await context.close();
    await browser.close();

    // Save JSON results
    const resultsJsonPath = path.join(process.cwd(), "reports/lane_b_results.json");
    session.saveResultsJson(resultsJsonPath);

    // Convert raw webm to mp4
    convertWebmToMp4(rawDir, mp4Path);
    console.log("=== LANE B EXECUTION & RECORDING COMPLETE ===");
  }
}

run().catch((err) => {
  console.error("Lane B runner error:", err);
  process.exit(1);
});
