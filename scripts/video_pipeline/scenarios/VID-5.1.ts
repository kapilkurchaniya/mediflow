import type { ScenarioRunner } from "./types";

export const runVID5_1: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  console.log("Loading Adding Suppliers & Distributor Profiles scenario...");
  await page.goto(`${baseUrl}/dashboard/suppliers`);
  await page.waitForSelector('h1:has-text("Suppliers")', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Scene 1: Welcome & Supplier Master Overview
  await playScene(0, async () => {
    await spotlight('h1:has-text("Suppliers")');
    await showKeyBadge("SUPPLIER DIRECTORY", "Vendor Master Setup & GST Input Credit Compliance");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Click Add Supplier Button
  await playScene(1, async () => {
    const newBtn = page.locator('a[href*="/suppliers/new"], a:has-text("Add supplier")').first();
    if (await newBtn.isVisible()) {
      await spotlight('a[href*="/suppliers/new"], a:has-text("Add supplier")');
    }
    await showKeyBadge("DISTRIBUTOR ONBOARDING", "Register Wholesalers, Stockists & C&F Agents");
    await page.waitForTimeout(1600);

    if (await newBtn.isVisible()) {
      await newBtn.click();
      await page.waitForSelector('h1:has-text("New supplier")', { timeout: 10000 });
      await page.waitForTimeout(600);
    }

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Basic Contact Information
  await playScene(2, async () => {
    const nameInput = page.locator("input#name");
    if (await nameInput.isVisible()) {
      await nameInput.fill("Apex Healthcare Distributors");
    }
    const contactInput = page.locator("input#contactPerson");
    if (await contactInput.isVisible()) {
      await contactInput.fill("Rajesh Sharma");
    }
    const phoneInput = page.locator("input#phone");
    if (await phoneInput.isVisible()) {
      await phoneInput.fill("98230 11223");
    }

    await spotlight("input#name");
    await showKeyBadge("BASIC INFORMATION", "Agency Trade Name · Primary Contact & Phone");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Statutory GSTIN & Drug Licence
  await playScene(3, async () => {
    const gstinInput = page.locator("input#gstin");
    if (await gstinInput.isVisible()) {
      await gstinInput.fill("27AAACA1234A1Z5");
    }
    const dlInput = page.locator("input#drugLicenseNo");
    if (await dlInput.isVisible()) {
      await dlInput.fill("MH-MZ-20B-18492");
    }
    const addrInput = page.locator("textarea#address");
    if (await addrInput.isVisible()) {
      await addrInput.fill("Plot 42, Wholesale Pharma Market, Mumbai");
    }

    await spotlight("input#gstin");
    await showKeyBadge("STATUTORY COMPLIANCE", "15-Digit GSTIN · State Code Routing · Drug Controller Licence");
    await page.waitForTimeout(2400);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Trade Terms & Save Supplier
  await playScene(4, async () => {
    const creditInput = page.locator("input#creditDays");
    if (await creditInput.isVisible()) {
      await creditInput.fill("30");
      await spotlight("input#creditDays");
    }

    const saveBtn = page.locator('button[type="submit"]:has-text("Save supplier")').first();
    if (await saveBtn.isVisible()) {
      await spotlight('button[type="submit"]:has-text("Save supplier")');
    }
    await showKeyBadge("TRADE TERMS & SAVE", "30-Day Payment Terms · Ready for Purchase Orders & GRNs");
    await page.waitForTimeout(1600);

    if (await saveBtn.isVisible()) {
      await saveBtn.click();
      try {
        await page.waitForURL("**/dashboard/suppliers", { timeout: 8000 });
        await page.waitForTimeout(800);
        await spotlight("table");
      } catch (e) {
        console.log("Supplier save navigation completed or handled");
      }
    }
    await page.waitForTimeout(1500);

    await clearSpotlight();
    await clearKeyBadge();
  });
};
