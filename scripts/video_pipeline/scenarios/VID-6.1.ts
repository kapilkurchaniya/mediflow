import type { ScenarioRunner } from "./types";

export const runVID6_1: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  console.log("Loading Customer Directory & Credit Configuration scenario...");
  await page.goto(`${baseUrl}/dashboard/customers`);
  await page.waitForSelector('h1:has-text("Customers")', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Scene 1: Welcome & Directory Overview
  await playScene(0, async () => {
    await spotlight('h1, a[href*="/customers/new"]');
    await showKeyBadge("CUSTOMER DIRECTORY", "Patient Profiles · WhatsApp Delivery · Khata Credit Limits");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Click New Customer & Input Contact Info
  await playScene(1, async () => {
    const newCustBtn = page.locator('a[href*="/dashboard/customers/new"], a:has-text("New customer")').first();
    if (await newCustBtn.isVisible()) {
      await newCustBtn.click();
      await page.waitForSelector("#name", { timeout: 10000 });
      await page.waitForTimeout(600);
    }

    await page.fill("#name", "Vikram Malhotra");
    await page.fill("#phone", "98201 55432");
    await page.fill("#email", "vikram.m@gmail.com");

    await spotlight("#name, #phone, #email");
    await showKeyBadge("PATIENT CONTACT", "Mobile for WhatsApp PDF Receipts & Automatic Refill Reminders");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: B2B GSTIN & Automatic Place of Supply
  await playScene(2, async () => {
    const gstinInput = page.locator("#gstin");
    if (await gstinInput.isVisible()) {
      await gstinInput.fill("27AABCS1429B1Z1");
      await page.waitForTimeout(400);
    }

    await spotlight("#gstin, #stateCode");
    await showKeyBadge("B2B GSTIN COMPLIANCE", "Automated State Detection · Intra vs Inter-State Invoicing");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Establish Credit Limit & Clinical Notes
  await playScene(3, async () => {
    const creditInput = page.locator("#creditLimit");
    if (await creditInput.isVisible()) {
      await creditInput.fill("10000");
    }

    const notesInput = page.locator("#notes");
    if (await notesInput.isVisible()) {
      await notesInput.fill("Hypertension patient · Monthly Telma 40 refills");
    }

    await spotlight("#creditLimit, #notes");
    await showKeyBadge("KHATA CREDIT LIMIT", "Max ₹10,000 Credit Ceiling · Monthly Ledger Settlement");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Save Customer Profile & Active Verification
  await playScene(4, async () => {
    const saveBtn = page.locator('button[type="submit"]:has-text("Save customer")').first();
    if (await saveBtn.isVisible()) {
      await spotlight('button[type="submit"]:has-text("Save customer")');
      await page.waitForTimeout(600);
      await saveBtn.click();
      try {
        await page.waitForURL("**/dashboard/customers", { timeout: 8000 });
        await page.waitForTimeout(600);
        await spotlight("table");
      } catch (e) {
        console.log("Customer save redirect handled");
      }
    }

    await showKeyBadge("CUSTOMER ACTIVE", "Searchable Across Counters · Real-Time Balance & Refill Tracking");
    await page.waitForTimeout(2400);

    await clearSpotlight();
    await clearKeyBadge();
  });
};
