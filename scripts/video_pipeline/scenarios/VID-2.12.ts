import type { ScenarioRunner } from "./types";

export const runVID2_12: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  // Navigate to POS billing counter
  console.log("Loading POS billing counter for Promise Orders scenario...");
  await page.goto(`${baseUrl}/dashboard/sales/pos`);
  await page.waitForSelector('input[placeholder*="Search medicine"]', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Clear existing cart if any
  const clearBtn = page.locator('button[title*="New bill"]');
  if (await clearBtn.isVisible()) {
    await clearBtn.click();
    await page.waitForTimeout(400);
  }

  // Scene 1: Welcome & Overview of Promise Orders
  await playScene(0, async () => {
    await spotlight('h1:has-text("POS Billing Counter")');
    await showKeyBadge("PROMISE ORDERS", "Capturing Patient Demand for Out-of-Stock Items");
    await page.waitForTimeout(2200);

    // Spotlight the search bar
    await spotlight('input[placeholder*="Search medicine"]');
    await page.waitForTimeout(2000);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Search Out-of-Stock Medicine & Detect Demand
  await playScene(1, async () => {
    const searchInput = page.locator('input[placeholder*="Search medicine"]');
    await spotlight('input[placeholder*="Search medicine"]');
    await showKeyBadge("SEARCH MEDICINE", "Search Augmentin 625 Duo");
    await page.waitForTimeout(800);

    await searchInput.fill("");
    await searchInput.pressSequentially("Augmentin", { delay: 65 });
    await page.waitForTimeout(900);

    // Wait for dropdown result with Out of Stock badge
    const searchDropdown = page.locator(".card.shadow-pop");
    await searchDropdown.waitFor({ state: "visible", timeout: 6000 });

    // Spotlight the Out of Stock row
    await spotlight(".card.shadow-pop table.data-table tbody tr");
    await showKeyBadge("OUT OF STOCK", "Augmentin 625 Duo · 0 Stock on Hand");
    await page.waitForTimeout(2200);

    // Spotlight the Promise Order button
    const promiseBtn = page.locator('.card.shadow-pop button:has-text("Promise Order")').first();
    await promiseBtn.waitFor({ state: "visible", timeout: 4000 });
    await spotlight('.card.shadow-pop button:has-text("Promise Order")');
    await showKeyBadge("PROMISE ORDER", "Capture Patient Contact & Demand");
    await page.waitForTimeout(1600);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Open Modal & Record Patient Demand
  await playScene(2, async () => {
    const promiseBtn = page.locator('.card.shadow-pop button:has-text("Promise Order")').first();
    await promiseBtn.click();

    // Modal appears
    const modalHeader = page.locator('h3:has-text("Promise Order")');
    await modalHeader.waitFor({ state: "visible", timeout: 5000 });
    await page.waitForTimeout(500);

    // Spotlight modal
    await spotlight('.card:has(h3:has-text("Promise Order"))');
    await showKeyBadge("PATIENT DETAILS", "Suresh Verma · 9876543210 · 2 Strips");
    await page.waitForTimeout(1000);

    // Fill customer name
    const nameInput = page.locator('.card:has(h3:has-text("Promise Order")) input[placeholder="Name"]');
    await nameInput.fill("Suresh Verma");
    await page.waitForTimeout(400);

    // Fill phone number
    const phoneInput = page.locator('.card:has(h3:has-text("Promise Order")) input[placeholder="10 digits"]');
    await phoneInput.fill("9876543210");
    await page.waitForTimeout(400);

    // Fill quantity
    const qtyInput = page.locator('.card:has(h3:has-text("Promise Order")) input[type="number"]');
    if (await qtyInput.isVisible()) {
      await qtyInput.fill("2");
      await page.waitForTimeout(400);
    }

    // Fill notes
    const notesInput = page.locator('.card:has(h3:has-text("Promise Order")) input[placeholder*="tomorrow"]');
    if (await notesInput.isVisible()) {
      await notesInput.fill("Urgent: Needed by evening");
      await page.waitForTimeout(400);
    }

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Save Promise Order & Trigger Procurement Sync
  await playScene(3, async () => {
    const saveBtn = page.locator('.card:has(h3:has-text("Promise Order")) button:has-text("Save Promise Order")');
    await spotlight('.card:has(h3:has-text("Promise Order")) button[type="submit"]');
    await showKeyBadge("SAVE PROMISE ORDER", "Log Patient Demand to Procurement");
    await page.waitForTimeout(1400);

    // Submit promise order
    await saveBtn.click();
    await page.waitForTimeout(1200);

    await showKeyBadge("DEMAND RECORDED", "Supplier Order Generated for Inwarding");
    await page.waitForTimeout(2000);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Counter Continuity & Wrap-Up
  await playScene(4, async () => {
    await spotlight('h1:has-text("POS Billing Counter")');
    await showKeyBadge("ZERO LOST CUSTOMERS", "Patient Retained · Seamless Counter Ready");
    await page.waitForTimeout(2400);

    await clearSpotlight();
    await clearKeyBadge();
  });
};
