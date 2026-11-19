import type { ScenarioRunner } from "./types";

export const runVID7_4: ScenarioRunner = async (ctx) => {
  const { page, baseUrl, playScene, showKeyBadge, clearKeyBadge, spotlight, clearSpotlight } = ctx;

  console.log("Loading Meta WhatsApp Cloud API Setup scenario...");
  await page.goto(`${baseUrl}/dashboard/settings/whatsapp`);
  await page.waitForSelector('h1, input#phoneNumberId', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Scene 1: Welcome & Meta Cloud API Overview
  await playScene(0, async () => {
    await spotlight("form.card, h1");
    await showKeyBadge("WHATSAPP CLOUD API", "Meta Official Gateway · Verified Brand Sender · PDF Deliveries");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 2: Meta App Credentials Form
  await playScene(1, async () => {
    await spotlight(".card-body, form");
    await showKeyBadge("META APP CREDENTIALS", "Direct Developer App Connection · Zero Third-Party Markup");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 3: Phone Number ID & WABA Credentials
  await playScene(2, async () => {
    const phoneIdInput = page.locator("#phoneNumberId");
    if (await phoneIdInput.isVisible()) {
      await phoneIdInput.fill("109847284729102");
    }

    const wabaInput = page.locator("#businessAccountId");
    if (await wabaInput.isVisible()) {
      await wabaInput.fill("987654321098765");
    }

    await spotlight("#phoneNumberId, #businessAccountId");
    await showKeyBadge("PHONE ID & WABA", "Meta Business Manager Account ID · Verified Phone Number ID");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 4: Permanent System Token & Webhook Verify Token
  await playScene(3, async () => {
    const tokenInput = page.locator("#accessToken");
    if (await tokenInput.isVisible()) {
      await tokenInput.fill("EAABwzL1...[Permanent System Token]");
    }

    const webhookInput = page.locator("#webhookVerifyToken, input[name='webhookVerifyToken']");
    if (await webhookInput.isVisible()) {
      await webhookInput.fill("mediflow_live_verify_token_2026");
    }

    await spotlight("#accessToken, div:has(> #webhookVerifyToken)");
    await showKeyBadge("TOKEN & WEBHOOK SYNC", "Permanent Graph API Bearer Token · Real-Time Webhook Reception");
    await page.waitForTimeout(2200);

    await clearSpotlight();
    await clearKeyBadge();
  });

  // Scene 5: Save & Activate Live Cloud Gateway
  await playScene(4, async () => {
    const saveBtn = page.locator('button:has-text("Save API Configuration")').first();
    if (await saveBtn.isVisible()) {
      await spotlight('button:has-text("Save API Configuration")');
      await page.waitForTimeout(800);
      await saveBtn.click();
      await page.waitForTimeout(1400);
    }

    await spotlight(".alert-success, form");
    await showKeyBadge("GATEWAY CONNECTED", "Meta Cloud API Live · Automatic Tax Invoice Dispatch Active");
    await page.waitForTimeout(2400);

    await clearSpotlight();
    await clearKeyBadge();
  });
};
