import type { ScenarioRunner } from "./types";

export const runVID5_4: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  console.log("Loading Generating Formal Purchase Orders & PDF scenario...");
  await page.goto(`${baseUrl}/dashboard/purchases/orders`);
  await page.waitForSelector('h1:has-text("Purchase Orders")', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Scene 1: Welcome & Purchase Orders Overview
  await playScene(0, async () => {
    await spotlight('h1:has-text("Purchase Orders")');
    await showKeyBadge("PURCHASE ORDERS", "Standardized Vendor Procurement & Reorder Verification");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: New PO Form & Supplier Header
  await playScene(1, async () => {
    const newBtn = page.locator('a:has-text("New purchase order")').first();
    if (await newBtn.isVisible()) {
      await newBtn.click();
      await page.waitForSelector("select", { timeout: 10000 });
      await page.waitForTimeout(600);
    }

    // Select Supplier
    const supSelect = page.locator("select").first();
    if (await supSelect.isVisible()) {
      const options = await supSelect.locator("option").all();
      if (options.length > 1) {
        const val = await options[1].getAttribute("value");
        if (val) await supSelect.selectOption(val);
      }
    }

    // Expected Date
    const dateInput = page.locator('input[type="date"]').first();
    if (await dateInput.isVisible()) {
      await dateInput.fill("2027-02-15");
    }

    await spotlight("select, input[type='date']");
    await showKeyBadge("ORDER HEADER", "Distributor Selection · Target Delivery Schedule");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Order Line Items & Quantities
  await playScene(2, async () => {
    const medSelect = page.locator("table select").first();
    if (await medSelect.isVisible()) {
      const options = await medSelect.locator("option").all();
      if (options.length > 1) {
        const val = await options[1].getAttribute("value");
        if (val) await medSelect.selectOption(val);
      }
    }

    const qtyInput = page.locator('table input[type="number"]').first();
    if (await qtyInput.isVisible()) {
      await qtyInput.fill("50");
    }

    await spotlight("table tr:has(select)");
    await showKeyBadge("ORDER ITEMS", "Medicine SKU · Reorder Quantity · Anticipated Cost PTR");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Order Notes & Save Draft PO
  await playScene(3, async () => {
    const notesInput = page.locator("input#po-notes");
    if (await notesInput.isVisible()) {
      await notesInput.fill("Priority dispatch requested for central pharmacy store");
      await spotlight("input#po-notes");
    }

    const saveBtn = page.locator('button:has-text("Save as Draft PO")').first();
    if (await saveBtn.isVisible()) {
      await saveBtn.click();
      try {
        await page.waitForURL("**/dashboard/purchases/orders/**", { timeout: 8000 });
        await page.waitForTimeout(800);
      } catch (e) {
        console.log("PO save navigation completed or handled");
      }
    }

    await showKeyBadge("PO REGISTERED", "Unique Order ID Assigned · Multi-Stage Approval Workflow");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Order Approval & Print / Export PDF
  await playScene(4, async () => {
    const approveBtn = page.locator('button:has-text("Approve Order"), button:has-text("Approve")').first();
    if (await approveBtn.isVisible()) {
      await approveBtn.click();
      await page.waitForTimeout(800);
    }

    const printLink = page.locator('a:has-text("Print / Export PDF"), a:has-text("Export PDF"), a:has-text("Print")').first();
    if (await printLink.isVisible()) {
      await spotlight('a:has-text("Print / Export PDF"), a:has-text("Export PDF"), a:has-text("Print")');
    }
    await showKeyBadge("APPROVED & EXPORT PDF", "Download Formal Purchase Order PDF for Vendor Dispatch");
    await page.waitForTimeout(2400);

    await clearSpotlight();
    await clearKeyBadge();
  });
};
