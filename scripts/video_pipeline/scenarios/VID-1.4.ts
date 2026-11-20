import type { ScenarioRunner } from "./types";

export const runVID1_4: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  // Initial navigation to /dashboard/settings/users (pre-authenticated as admin)
  console.log("Loading staff & access settings...");
  await page.goto(`${baseUrl}/dashboard/settings/users`);
  await page.waitForSelector("table.data-table", { timeout: 10000 });
  await page.waitForTimeout(500);

  // Scene 1: Introduction to Statutory Roles & RBAC Safeguards
  await playScene(0, async () => {
    // Spotlight the page header and eyebrow
    await spotlight(".space-y-6 > div:first-child");
    await showKeyBadge("RBAC", "7 Statutory Roles");
    await page.waitForTimeout(1600);
    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Staff & Access Directory Table
  await playScene(1, async () => {
    // Spotlight the Team members table
    const tableCard = page.locator(".card").filter({ has: page.locator("table.data-table") }).last();
    if (await tableCard.isVisible()) {
      await spotlight(".card:has(table.data-table)");
    }

    // Hover over cashier and pharmacist rows
    const rows = page.locator("table.data-table tbody tr");
    if ((await rows.count()) > 1) {
      await rows.nth(1).hover();
      await page.waitForTimeout(700);
      await rows.nth(2).hover();
    }
    await page.waitForTimeout(1500);
    await clearSpotlight();
  });

  // Scene 3: Role Capabilities & Permission Safeguards
  await playScene(2, async () => {
    // Click edit on the first non-admin team member
    const editBtns = page.locator('table.data-table tbody tr button:has-text("Edit")');
    if ((await editBtns.count()) > 0) {
      await editBtns.first().click();
      await page.waitForSelector(".card.border-brand-200", { timeout: 5000 });
      await spotlight(".card.border-brand-200");
    }

    await showKeyBadge("ROLE SAFEGUARD", "No Margin Leaks");

    // Focus role select to showcase role description
    const roleSelect = page.locator(".card.border-brand-200 select");
    if (await roleSelect.isVisible()) {
      await roleSelect.click();
    }
    await page.waitForTimeout(2200);
  });

  // Scene 4: Multi-Branch Access Control & Suspension
  await playScene(3, async () => {
    // Highlight branch access fieldset in edit form
    await spotlight(".card.border-brand-200 fieldset");
    await page.waitForTimeout(1200);

    // Cancel edit form to view status badges
    const cancelBtn = page.locator('.card.border-brand-200 button:has-text("Cancel")');
    if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
    }
    await clearSpotlight();

    // Spotlight the active status badges and suspend controls
    await spotlight(".badge-success");
    await showKeyBadge("SUSPEND", "Revoke Session Access");
    await page.waitForTimeout(2000);
    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Summary & Transition to Part 5 (Pharmacy Profile & GST Rule 46)
  await playScene(4, async () => {
    await showKeyBadge("PART 5", "Pharmacy Profile & GST Rule 46");
    const settingsLink = page.locator('aside a[href="/dashboard/settings"]').first();
    if (await settingsLink.isVisible()) {
      await spotlight('aside a[href="/dashboard/settings"]');
      await settingsLink.hover();
    }
    await page.waitForTimeout(1500);
  });

  // Final cleanup before recording finishes
  await clearKeyBadge();
  await clearSpotlight();
  await page.waitForTimeout(300);
};
