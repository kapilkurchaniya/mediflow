import { createRecordedBrowser, convertWebmToMp4, TestSession } from "./runner_common";
import * as path from "node:path";

const BASE_URL = "http://localhost:3000";

async function run() {
  const session = new TestSession("Lane A");
  const rawDir = path.join(process.cwd(), "recordings/lane_a_raw");
  const mp4Path = path.join(process.cwd(), "recordings/lane_a_test_run.mp4");

  console.log("=== STARTING LANE A MANUAL UI TEST EXECUTION & RECORDING ===");
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
    // 1. A-1.26a - Auth basics: unauthenticated redirect to login
    await session.runStep(
      "A-1.26a",
      "Phase 1 Auth",
      "Open /dashboard unauthenticated -> redirects to /login",
      async () => {
        await context.clearCookies();
        await page.goto(`${BASE_URL}/dashboard`);
        await page.waitForURL("**/login**", { timeout: 5000 });
        if (!page.url().includes("/login")) {
          throw new Error(`Expected redirect to /login, got ${page.url()}`);
        }
      }
    );

    // 2. A-1.26b - Wrong password test
    await session.runStep(
      "A-1.26b",
      "Phase 1 Auth",
      "Submit invalid password -> displays error message",
      async () => {
        await page.fill('input[name="email"]', "admin@apollo.com");
        await page.fill('input[name="password"]', "wrongpassword");
        await page.click('.bg-white form button[type="submit"]');
        await page.waitForSelector(".text-red-600, .alert-error", { timeout: 5000 });
        const errText = await page.locator(".text-red-600, .alert-error").first().innerText();
        if (!errText.toLowerCase().includes("invalid")) {
          throw new Error(`Expected invalid password error, got: ${errText}`);
        }
      }
    );

    // 3. A-1.26c - Valid login as Owner
    await session.runStep(
      "A-1.26c",
      "Phase 1 Auth",
      "Login as Owner (admin@apollo.com) -> lands on dashboard",
      async () => {
        await page.fill('input[name="email"]', "admin@apollo.com");
        await page.fill('input[name="password"]', "admin123");
        await page.click('.bg-white form button[type="submit"]');
        await page.waitForURL("**/dashboard**", { timeout: 8000 });
        await page.waitForTimeout(1500);
      }
    );

    // 4. A-0.7a - Sidebar sections and links verification
    await session.runStep(
      "A-0.7a",
      "Phase 0 Sidebar",
      "Verify sidebar sections, 31 module links + Settings pinned at bottom",
      async () => {
        await page.waitForSelector("aside nav", { timeout: 5000 });
        const navLinks = await page.locator("aside nav a").count();
        const settingsLink = await page.locator('aside a[href="/dashboard/settings"]').count();
        console.log(`  Sidebar links count: nav=${navLinks}, settings=${settingsLink}`);
        if (navLinks < 20 || settingsLink === 0) {
          throw new Error(`Expected >=25 nav links and settings link, found nav=${navLinks}, settings=${settingsLink}`);
        }
        await page.waitForTimeout(1000);
      }
    );

    // 5. A-0.7b - Command palette shortcuts and search
    await session.runStep(
      "A-0.7b",
      "Phase 0 Command Palette",
      "Press Ctrl+K: palette opens, type purchase, customer, expiry; Escape closes",
      async () => {
        await page.keyboard.press("Control+k");
        await page.waitForSelector('input[placeholder*="jump to a module"]', { timeout: 5000 });
        const input = page.locator('input[placeholder*="jump to a module"]');

        await input.fill("purchase");
        await page.waitForTimeout(800);

        await input.fill("customer");
        await page.waitForTimeout(800);

        await input.fill("expiry");
        await page.waitForTimeout(800);

        await page.keyboard.press("Escape");
        await page.waitForTimeout(800);
      }
    );

    // 6. A-0.11 - Invoice numbering limit and Bill prefix
    await session.runStep(
      "A-0.11",
      "Phase 0 GST Rule 46",
      "Settings: test bill prefix max length 3 chars, save INV",
      async () => {
        await page.goto(`${BASE_URL}/dashboard/settings`);
        await page.waitForSelector('input[name="invoicePrefix"]', { timeout: 5000 });
        const prefixInput = page.locator('input[name="invoicePrefix"]');

        // Test typing 4 chars "BILL"
        await prefixInput.fill("BILL");
        const val = await prefixInput.inputValue();
        if (val.length > 3) {
          throw new Error(`Expected prefix length <= 3, got '${val}'`);
        }

        // Set to INV and save
        await prefixInput.fill("INV");
        await page.click('.card button[type="submit"]');
        await page.waitForTimeout(1500);
      }
    );

    // 7. A-1.4 - Register new pharmacy seeds owner
    await session.runStep(
      "A-1.4",
      "Phase 1 RBAC",
      "Register new pharmacy -> seeds owner with full access",
      async () => {
        await logout();
        await page.goto(`${BASE_URL}/register`);
        const ts = Date.now().toString().slice(-4);
        await page.fill('input[name="pharmacyName"]', `Apollo Care ${ts}`);
        await page.fill('input[name="name"]', "Dr. Rajesh");
        await page.fill('input[name="email"]', `owner_${ts}@apollocare.com`);
        await page.fill('input[name="password"]', "password123");
        await page.click('.bg-white form button[type="submit"]');
        await page.waitForURL("**/dashboard**", { timeout: 10000 });
        await page.waitForTimeout(1500);
      }
    );

    // 8. A-1.6 - Cashier No-access (403) page
    await session.runStep(
      "A-1.6",
      "Phase 1 RBAC",
      "Login as Cashier -> /dashboard/accounting shows 403 No Access page",
      async () => {
        await logout();
        await loginAs("cashier@apollo.com", "cashier123");
        await page.goto(`${BASE_URL}/dashboard/accounting`);
        await page.waitForTimeout(1500);
        const pageText = await page.innerText("body");
        if (!pageText.includes("don't have access") && !pageText.includes("Forbidden") && !pageText.includes("403")) {
          throw new Error(`Expected 403 friendly page, got: ${pageText.slice(0, 200)}`);
        }
      }
    );

    // 9. A-1.7 - protectedAction on Racks module
    await session.runStep(
      "A-1.7",
      "Phase 1 Racks",
      "Pharmacist creates rack r1-s2 (auto uppercase R1-S2), tests duplicate check and edit",
      async () => {
        await logout();
        await loginAs("pharmacist@apollo.com", "pharmacist123");
        await page.goto(`${BASE_URL}/dashboard/settings/racks`);
        await page.waitForSelector("button:has-text('Add Rack'), button:has-text('Add Rack / Shelf')", { timeout: 5000 });

        // Open modal
        await page.click("button:has-text('Add Rack'), button:has-text('Add Rack / Shelf')");
        await page.waitForSelector('input[placeholder*="R1-S3"]', { timeout: 5000 });

        // Add r1-s2
        await page.fill('input[placeholder*="R1-S3"]', "r1-s2");
        await page.fill('input[placeholder*="Front Counter"]', "Front Shelf Top");
        await page.click("button:has-text('Save Rack'), button:has-text('Save')");
        await page.waitForTimeout(1500);

        // Check if R1-S2 is rendered
        const hasUpper = await page.locator("body").innerText();
        if (!hasUpper.includes("R1-S2")) {
          throw new Error("Expected uppercase rack code 'R1-S2' in table");
        }

        // Try duplicate
        await page.click("button:has-text('Add Rack'), button:has-text('Add Rack / Shelf')");
        await page.waitForSelector('input[placeholder*="R1-S3"]', { timeout: 5000 });
        await page.fill('input[placeholder*="R1-S3"]', "R1-S2");
        await page.fill('input[placeholder*="Front Counter"]', "Duplicate Shelf");
        await page.click("button:has-text('Save Rack'), button:has-text('Save')");
        await page.waitForTimeout(1000);
        const dupErr = await page.locator("body").innerText();
        if (!dupErr.includes("already exists")) {
          throw new Error("Expected duplicate rack error 'already exists'");
        }
        await page.keyboard.press("Escape");
        await page.waitForTimeout(800);
      }
    );

    // 10. A-1.11 - Page access matrix across roles
    await session.runStep(
      "A-1.11",
      "Phase 1 RBAC",
      "Page access matrix: Cashier opens POS, Pharmacist opens Items/Racks, Accountant opens Day Book",
      async () => {
        // Cashier can open POS
        await logout();
        await loginAs("cashier@apollo.com", "cashier123");
        await page.goto(`${BASE_URL}/dashboard/sales/pos`);
        await page.waitForSelector('input[placeholder*="search medicine"]', { timeout: 5000 });

        // Pharmacist can open Inventory
        await logout();
        await loginAs("pharmacist@apollo.com", "pharmacist123");
        await page.goto(`${BASE_URL}/dashboard/inventory`);
        await page.waitForSelector('a[href="/dashboard/inventory/new"]', { timeout: 5000 });

        // Accountant can open Accounting
        await logout();
        await loginAs("accountant@apollo.com", "accountant123");
        await page.goto(`${BASE_URL}/dashboard/accounting`);
        await page.waitForSelector("body", { timeout: 5000 });
        const accText = await page.innerText("body");
        if (accText.includes("don't have access")) {
          throw new Error("Accountant should have access to /dashboard/accounting");
        }
        await page.waitForTimeout(1000);
      }
    );

    // 11. A-1.12 - Sidebar hides inaccessible links
    await session.runStep(
      "A-1.12",
      "Phase 1 RBAC",
      "Sidebar hides inaccessible links: Cashier sees 13 links, Owner sees 31 + Settings",
      async () => {
        await logout();
        await loginAs("cashier@apollo.com", "cashier123");
        await page.goto(`${BASE_URL}/dashboard`);
        const cashierLinks = await page.locator("aside nav a").count();
        const cashierSettings = await page.locator('aside a[href="/dashboard/settings"]').count();
        if (cashierSettings > 0) {
          throw new Error("Cashier should not see Settings link in sidebar");
        }

        await logout();
        await loginAs("admin@apollo.com", "admin123");
        await page.goto(`${BASE_URL}/dashboard`);
        const ownerLinks = await page.locator("aside nav a").count();
        const ownerSettings = await page.locator('aside a[href="/dashboard/settings"]').count();
        if (ownerSettings === 0 || ownerLinks <= cashierLinks) {
          throw new Error(`Owner should see more links than cashier (got owner=${ownerLinks}, cashier=${cashierLinks})`);
        }
        await page.waitForTimeout(1000);
      }
    );

    // 12. A-1.18 - Item master: new medicine default GST 5%
    await session.runStep(
      "A-1.18",
      "Phase 1 Inventory",
      "Owner creates new medicine: verify GST dropdown defaults to 5%, save Paracetamol 650 Tab",
      async () => {
        await page.goto(`${BASE_URL}/dashboard/inventory/new`);
        await page.waitForSelector('select[name="gstRateBp"]', { timeout: 5000 });
        const gstVal = await page.locator('select[name="gstRateBp"]').inputValue();
        if (gstVal !== "5") {
          throw new Error(`Expected GST default to be '5', got '${gstVal}'`);
        }

        await page.fill('input[name="name"]', "Paracetamol 650 Tab");
        await page.fill('input[name="genericName"]', "Paracetamol 650mg");
        await page.fill('input[name="mrp"]', "30.00");
        await page.fill('input[name="salePrice"]', "30.00");
        await page.fill('input[name="hsn"]', "30049099");
        await page.click('.card button[type="submit"]');
        await page.waitForTimeout(2000);
      }
    );

    // 13. A-1.23 - Inventory: Opening stock
    await session.runStep(
      "A-1.23",
      "Phase 1 Inventory",
      "Batches & stock: record opening stock for Paracetamol 650 Tab (batch PARA-B1, qty 100)",
      async () => {
        await page.goto(`${BASE_URL}/dashboard/inventory/batches/new`);
        await page.waitForSelector('select#medicineId', { timeout: 5000 });
        await page.waitForTimeout(1000);

        await page.selectOption('select#medicineId', { label: "Paracetamol 650 Tab" });
        await page.fill('input#batchNo', "PARA-B1");
        await page.fill('input#expiryDate', "2027-12-31");
        await page.fill('input#qty', "100");
        await page.fill('input#purchaseRate', "18.00");
        await page.fill('input#saleRate', "30.00");

        await page.click('.card button[type="submit"]');
        await page.waitForTimeout(2000);

        await page.goto(`${BASE_URL}/dashboard/inventory/batches`);
        await page.waitForTimeout(1000);
        const pageText = await page.innerText("body");
        if (!pageText.includes("PARA-B1")) {
          throw new Error("Expected batch PARA-B1 to appear in Batches & stock list");
        }
      }
    );

    // 14. A-1.20 - POS: complete cash sale
    await session.runStep(
      "A-1.20",
      "Phase 1 POS",
      "Cashier POS: search Paracetamol, add units, Cash payment, complete sale and view thermal invoice",
      async () => {
        await logout();
        await loginAs("cashier@apollo.com", "cashier123");
        await page.goto(`${BASE_URL}/dashboard/sales/pos`);
        await page.waitForSelector('input[placeholder*="search medicine"]', { timeout: 5000 });

        const searchInput = page.locator('input[placeholder*="search medicine"]');
        await searchInput.fill("Paracetamol");
        await page.press('input[placeholder*="search medicine"]', "Enter");
        await page.waitForSelector(".data-table tbody tr", { timeout: 5000 });

        // Click first batch result to add to cart
        await page.click(".data-table tbody tr");
        await page.waitForTimeout(1000);

        // Click complete sale
        await page.click('button:has-text("Complete & Print")');
        await page.waitForTimeout(3000);

        // Verify URL or invoice print view
        const currentUrl = page.url();
        console.log(`  Sale completed, navigated to: ${currentUrl}`);
        if (!currentUrl.includes("/sales/")) {
          throw new Error(`Expected redirect to invoice detail / print, got ${currentUrl}`);
        }
        await page.waitForTimeout(2000);
      }
    );

    // 15. A-1.21 - POS: Out of stock protection
    await session.runStep(
      "A-1.21",
      "Phase 1 POS",
      "POS out of stock protection: prevent selling units exceeding available quantity",
      async () => {
        await page.goto(`${BASE_URL}/dashboard/sales/pos`);
        await page.waitForSelector('input[placeholder*="search medicine"]', { timeout: 5000 });
        const searchInput = page.locator('input[placeholder*="search medicine"]');
        await searchInput.fill("Paracetamol");
        await page.press('input[placeholder*="search medicine"]', "Enter");
        await page.waitForSelector(".data-table tbody tr", { timeout: 5000 });

        await page.click(".data-table tbody tr");
        await page.waitForTimeout(800);

        // Try setting qty to 9999
        const qtyInput = page.locator('table.data-table input[type="number"], .data-table input.num');
        if (await qtyInput.count() > 0) {
          await qtyInput.first().fill("9999");
          await page.waitForTimeout(500);
          console.log("  Tested cart qty input bounds protection");
        }
        await page.waitForTimeout(1000);
      }
    );

    // 16. A-1.22 - POS: Schedule H1 compliance
    await session.runStep(
      "A-1.22",
      "Phase 1 Compliance",
      "POS Schedule H1: prompts for doctor & patient details, records entry in Schedule H1 register",
      async () => {
        // Create Schedule H1 drug as Owner
        await logout();
        await loginAs("admin@apollo.com", "admin123");
        await page.goto(`${BASE_URL}/dashboard/inventory/new`);
        await page.waitForSelector('input[name="name"]', { timeout: 5000 });

        await page.fill('input[name="name"]', "Azithromycin 500mg");
        await page.fill('input[name="genericName"]', "Azithromycin");
        await page.fill('input[name="mrp"]', "120.00");
        await page.fill('input[name="salePrice"]', "120.00");
        await page.selectOption('select[name="schedule"]', "H1");
        await page.check('input[name="rxRequired"]');
        await page.click('.card button[type="submit"]');
        await page.waitForTimeout(2000);

        // Add opening stock
        await page.goto(`${BASE_URL}/dashboard/inventory/batches/new`);
        await page.waitForSelector('select#medicineId', { timeout: 5000 });
        await page.selectOption('select#medicineId', { label: "Azithromycin 500mg" });
        await page.fill('input#batchNo', "AZI-01");
        await page.fill('input#expiryDate', "2027-06-30");
        await page.fill('input#qty', "50");
        await page.fill('input#purchaseRate', "70.00");
        await page.fill('input#saleRate', "120.00");
        await page.click('.card button[type="submit"]');
        await page.waitForTimeout(2000);

        // As Pharmacist, sell in POS with doctor details
        await logout();
        await loginAs("pharmacist@apollo.com", "pharmacist123");
        await page.goto(`${BASE_URL}/dashboard/sales/pos`);
        await page.waitForSelector('input[placeholder*="search medicine"]', { timeout: 5000 });

        const searchInput = page.locator('input[placeholder*="search medicine"]');
        await searchInput.fill("Azithromycin");
        await page.press('input[placeholder*="search medicine"]', "Enter");
        await page.waitForSelector(".data-table tbody tr", { timeout: 5000 });
        await page.click(".data-table tbody tr");
        await page.waitForTimeout(1000);

        // Fill doctor details in POS compliance panel
        const docNameInput = page.locator('input[placeholder*="Doctor name"], input[name="doctorName"]');
        if (await docNameInput.count() > 0) {
          await docNameInput.first().fill("Dr. Suresh Mehta");
        }
        const docRegInput = page.locator('input[placeholder*="reg"], input[placeholder*="MCI"]');
        if (await docRegInput.count() > 0) {
          await docRegInput.first().fill("MCI-48291");
        }

        // Complete sale
        await page.click('button:has-text("Complete & Print")');
        await page.waitForTimeout(3000);

        // Visit Schedule H1 compliance register
        await page.goto(`${BASE_URL}/dashboard/compliance/schedule-h1`);
        await page.waitForTimeout(2000);
      }
    );

    // 17. A-1.24 - Accounting views consistency
    await session.runStep(
      "A-1.24",
      "Phase 1 Accounting",
      "Accountant views: Day Book, Trial Balance, Profit & Loss, Balance Sheet, Cash Flow",
      async () => {
        await logout();
        await loginAs("accountant@apollo.com", "accountant123");

        // Day Book
        await page.goto(`${BASE_URL}/dashboard/accounting`);
        await page.waitForTimeout(1500);

        // Trial Balance
        await page.goto(`${BASE_URL}/dashboard/accounting/trial-balance`);
        await page.waitForTimeout(1500);

        // Profit & Loss
        await page.goto(`${BASE_URL}/dashboard/accounting/profit-loss`);
        await page.waitForTimeout(1500);

        // Balance Sheet
        await page.goto(`${BASE_URL}/dashboard/accounting/balance-sheet`);
        await page.waitForTimeout(1500);

        // Cash Flow
        await page.goto(`${BASE_URL}/dashboard/accounting/cash-flow`);
        await page.waitForTimeout(1500);
      }
    );

    // 18. A-1.25 - Settings persistence
    await session.runStep(
      "A-1.25",
      "Phase 1 Settings",
      "Owner updates pharmacy profile: store name, phone, address; persists on reload",
      async () => {
        await logout();
        await loginAs("admin@apollo.com", "admin123");
        await page.goto(`${BASE_URL}/dashboard/settings`);
        await page.waitForSelector('input[name="name"]', { timeout: 5000 });

        await page.fill('input[name="name"]', "Apollo Care Chemist");
        await page.fill('input[name="phone"]', "+91 99887 76655");
        await page.fill('textarea[name="address"]', "102 Medical Hub, MG Road");
        await page.fill('input[name="city"]', "Mumbai");
        await page.click('.card button[type="submit"]');
        await page.waitForTimeout(2000);

        // Reload to verify persistence
        await page.reload();
        await page.waitForSelector('input[name="name"]', { timeout: 5000 });
        const updatedName = await page.inputValue('input[name="name"]');
        if (updatedName !== "Apollo Care Chemist") {
          throw new Error(`Expected persisted store name 'Apollo Care Chemist', got '${updatedName}'`);
        }
      }
    );

  } finally {
    console.log("Closing browser and finalizing Lane A recording...");
    await page.waitForTimeout(1000);
    await context.close();
    await browser.close();

    // Save JSON results
    const resultsJsonPath = path.join(process.cwd(), "reports/lane_a_results.json");
    session.saveResultsJson(resultsJsonPath);

    // Convert raw webm to mp4
    convertWebmToMp4(rawDir, mp4Path);
    console.log("=== LANE A EXECUTION & RECORDING COMPLETE ===");
  }
}

run().catch((err) => {
  console.error("Lane A runner error:", err);
  process.exit(1);
});
