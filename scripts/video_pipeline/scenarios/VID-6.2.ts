import type { ScenarioRunner } from "./types";

export const runVID6_2: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  console.log("Loading Family Health Groups & Shared Credit scenario...");
  await page.goto(`${baseUrl}/dashboard/customers/groups`);
  await page.waitForSelector('h1:has-text("Family Groups"), button:has-text("New Family Group")', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Scene 1: Welcome & Family Groups Overview
  await playScene(0, async () => {
    await spotlight("h1, .space-y-6");
    await showKeyBadge("FAMILY HEALTH GROUPS", "Consolidated Household Accounts · Shared Credit · Family Billing");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Inspect Groups List & Household Summary
  await playScene(1, async () => {
    const groupCard = page.locator(".space-y-2 button, .divide-y > div").first();
    if (await groupCard.isVisible()) {
      await groupCard.click();
      await page.waitForTimeout(600);
    }

    await spotlight(".col-span-12.lg\\:col-span-4, .card:first-child");
    await showKeyBadge("HOUSEHOLD DIRECTORY", "Active Families · Member Headcount · Shared Credit Ceilings");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Create New Family Group Modal
  await playScene(2, async () => {
    const createBtn = page.locator('button:has-text("New Family Group"), button:has-text("Create group")').first();
    if (await createBtn.isVisible()) {
      await spotlight('button:has-text("New Family Group")');
      await page.waitForTimeout(600);
      await createBtn.click();
      await page.waitForTimeout(600);
    }

    const nameInput = page.locator('input[name="name"]').first();
    if (await nameInput.isVisible()) {
      await nameInput.fill("Sharma Family Account");
    }

    const limitInput = page.locator('input[name="creditLimit"]').first();
    if (await limitInput.isVisible()) {
      await limitInput.fill("25000");
    }

    await spotlight(".fixed.inset-0, input[name='name']");
    await showKeyBadge("UNIFIED CREDIT CEILING", "Shared ₹25,000 Household Credit Limit Across All Members");
    await page.waitForTimeout(2200);

    const submitCreateBtn = page.locator('button[type="submit"]:has-text("Save Group")').first();
    if (await submitCreateBtn.isVisible()) {
      await submitCreateBtn.click();
      await page.waitForTimeout(800);
    }

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Add Member & Set Primary Payer
  await playScene(3, async () => {
    const addMemberBtn = page.locator('button:has-text("Add Family Member"), button:has-text("Add member")').first();
    if (await addMemberBtn.isVisible()) {
      await spotlight('button:has-text("Add Family Member")');
      await page.waitForTimeout(600);
      await addMemberBtn.click();
      await page.waitForTimeout(600);
    }

    const custSelect = page.locator(".fixed select").first();
    if (await custSelect.isVisible()) {
      const options = await custSelect.locator("option").all();
      if (options.length > 1) {
        await custSelect.selectOption({ index: 1 });
      }
    }

    await spotlight(".fixed.inset-0");
    await showKeyBadge("HOUSEHOLD MEMBERS", "Link Patient Profiles · Pooled Family Credit Access");
    await page.waitForTimeout(2200);

    const submitMemberBtn = page.locator('button[type="submit"]:has-text("Add to Group")').first();
    if (await submitMemberBtn.isVisible()) {
      await submitMemberBtn.click();
      await page.waitForTimeout(800);
    }

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: POS Integration & Consolidated Credit Summary
  await playScene(4, async () => {
    await spotlight(".col-span-12.lg\\:col-span-8, .space-y-4");
    await showKeyBadge("SHARED COUNTER BILLING", "Unified Available Credit · Real-Time Balance Deductions at POS");
    await page.waitForTimeout(2400);

    await clearSpotlight();
    await clearKeyBadge();
  });
};
