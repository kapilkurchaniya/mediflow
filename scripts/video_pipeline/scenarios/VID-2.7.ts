import type { ScenarioRunner } from "./types";

export const runVID2_7: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  // Navigate to POS billing counter
  console.log("Loading POS billing counter...");
  await page.goto(`${baseUrl}/dashboard/sales/pos`);
  await page.waitForSelector('input[placeholder*="Search medicine"]', { timeout: 10000 });
  await page.waitForTimeout(500);

  // Scene 1: Welcome & F6 introduction
  await playScene(0, async () => {
    // Spotlight header & show key badge
    await spotlight('h1:has-text("POS Billing Counter")');
    await showKeyBadge("F6", "Hold / Park Active Bill");
    await page.waitForTimeout(1600);

    const customerSelect = page.locator("select").first();
    if ((await customerSelect.count()) > 0) {
      await spotlight("select:first-of-type");
      const options = await customerSelect.locator("option").allTextContents();
      const rameshOption = options.find((o) => o.includes("Ramesh"));
      if (rameshOption) {
        await customerSelect.selectOption({ label: rameshOption });
      }
      await page.waitForTimeout(1400);
    }
    const searchInput = page.locator('input[placeholder*="Search medicine"]');
    await searchInput.click();
    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Adding items to active cart
  await playScene(1, async () => {
    const searchInput = page.locator('input[placeholder*="Search medicine"]');
    await spotlight('input[placeholder*="Search medicine"]');
    await showKeyBadge("F3", "Search Medicine");
    await page.waitForTimeout(600);

    // Paracetamol
    await searchInput.fill("");
    await searchInput.pressSequentially("Paracetamol", { delay: 70 });
    await searchInput.press("Enter");
    await page.waitForTimeout(600);
    const firstResult = page.locator(".card.shadow-pop table.data-table tbody tr").first();
    await firstResult.waitFor({ state: "visible", timeout: 6000 });
    await firstResult.click();
    await page.waitForTimeout(600);

    // Azithromycin
    await searchInput.click();
    await searchInput.fill("");
    await searchInput.pressSequentially("Azithromycin", { delay: 70 });
    await searchInput.press("Enter");
    await page.waitForTimeout(600);
    const secondResult = page.locator(".card.shadow-pop table.data-table tbody tr").first();
    await secondResult.waitFor({ state: "visible", timeout: 6000 });
    await secondResult.click();
    await page.waitForTimeout(600);

    // Spotlight active cart with medicines
    await spotlight(".card table.data-table");
    await showKeyBadge("ACTIVE CART", "Multiple Items Pending");
    await page.waitForTimeout(2000);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Hit F6 and add note
  await playScene(2, async () => {
    await showKeyBadge("F6", "Park Active Bill");
    await page.waitForTimeout(700);

    await page.keyboard.press("F6");
    await page.waitForSelector('h3:has-text("Hold Current Bill (F6)")', { timeout: 5000 }).catch(async () => {
      const holdBtn = page.locator('button:has-text("Hold (F6)")');
      if (await holdBtn.isVisible()) {
        await holdBtn.click();
        await page.waitForSelector('h3:has-text("Hold Current Bill (F6)")', { timeout: 5000 });
      }
    });
    await page.waitForTimeout(400);

    // Spotlight the modal
    const modal = page.locator('div:has(> h3:has-text("Hold Current Bill (F6)"))');
    if (await modal.isVisible()) {
      await spotlight('div:has(> h3:has-text("Hold Current Bill (F6)"))');
    }

    const noteInput = page.locator('input[placeholder*="Customer gone to fetch cash"]');
    await noteInput.click();
    await spotlight('input[placeholder*="Customer gone to fetch cash"]');
    await noteInput.pressSequentially("Stepped out for cash from ATM", { delay: 45 });
    await page.waitForTimeout(1200);

    await clearSpotlight();
  });

  // Scene 4: Confirm and clear counter
  await playScene(3, async () => {
    const submitParkBtn = page.locator('button:has-text("Hold Bill (F6)")');
    await spotlight('button:has-text("Hold Bill (F6)")');
    await page.waitForTimeout(1000);
    await submitParkBtn.click();

    await page.waitForSelector("text=Cart is empty", { timeout: 8000 });
    await spotlight(".card:has-text('Cart is empty')");
    await showKeyBadge("COUNTER READY", "Instant Counter Reset");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Queue stored safely & watch Part 8 with F7
  await playScene(4, async () => {
    // Spotlight the Parked Bills button on top bar
    const parkedBtn = page.locator('button:has-text("Parked")');
    if (await parkedBtn.isVisible()) {
      await spotlight('button:has-text("Parked")');
    }
    await showKeyBadge("F7", "Recall Parked Bills");
    await page.waitForTimeout(3000);
    await clearSpotlight();
    await clearKeyBadge();
  });

  // Cleanup
  await clearSpotlight();
  await clearKeyBadge();
  await page.waitForTimeout(300);
};
