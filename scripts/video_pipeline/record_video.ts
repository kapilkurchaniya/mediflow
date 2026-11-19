/* eslint-disable @typescript-eslint/no-explicit-any */
import { chromium, type Page, type BrowserContext } from "playwright";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { scenarioRegistry } from "./scenarios";
import type { Manifest, ScenarioContext } from "./scenarios/types";

const BASE_URL = process.env.BASE_URL || "http://localhost:3005";
const PIPELINE_DIR = path.join(process.cwd(), "scripts/video_pipeline");

interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

interface TimingsMetadata {
  durations: number[];
  initial_delay: number;
  scene_pads: number[];
  master_duration: number;
  scene_count: number;
  scene_subtitles?: SubtitleCue[][];
  pageReadyOffsetSec?: number;
}

async function injectOverlay(page: Page, manifest: Manifest) {
  await page.addStyleTag({
    content: `
      /* MediFlow Tutorial HUD Overlay */
      #mf-tutorial-hud {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 999999;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 8px;
        pointer-events: none;
        font-family: Liberation Sans, ui-sans-serif, system-ui, sans-serif;
      }
      .mf-hud-badge {
        background: rgba(15, 23, 42, 0.95);
        color: #f8fafc;
        border: 2px solid #38bdf8;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 15px rgba(56, 189, 248, 0.4);
        padding: 10px 20px;
        border-radius: 12px;
        font-size: 20px;
        font-weight: 800;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        display: inline-flex;
        align-items: center;
        gap: 10px;
        transform: translateY(20px);
        opacity: 0;
        transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .mf-hud-badge.active {
        transform: translateY(0);
        opacity: 1;
      }
      .mf-hud-key {
        background: #0284c7;
        color: #ffffff;
        padding: 4px 10px;
        border-radius: 6px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        font-family: Liberation Mono, monospace;
        font-size: 18px;
      }
      #mf-tutorial-captions {
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 999998;
        pointer-events: none;
        background: rgba(15, 23, 42, 0.94);
        backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: #ffffff;
        padding: 12px 28px;
        border-radius: 14px;
        font-size: 20px;
        font-weight: 600;
        line-height: 1.4;
        font-family: Liberation Sans, sans-serif;
        text-align: center;
        max-width: 84%;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);
        transition: opacity 0.2s ease;
      }
      #mf-top-series-tag {
        position: fixed;
        top: 16px;
        right: 24px;
        z-index: 999997;
        pointer-events: none;
        background: rgba(15, 23, 42, 0.88);
        border: 1px solid rgba(56, 189, 248, 0.4);
        color: #94a3b8;
        padding: 6px 16px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        display: flex;
        align-items: center;
        gap: 8px;
        font-family: Liberation Sans, sans-serif;
      }
      #mf-top-series-tag span {
        color: #38bdf8;
      }
      .mf-spotlight-highlight {
        outline: 4px solid #38bdf8 !important;
        outline-offset: 4px !important;
        box-shadow: 0 0 25px rgba(56, 189, 248, 0.8) !important;
        transition: all 0.3s ease !important;
      }
    `,
  });

  await page.evaluate((info) => {
    // Top bar tag
    const topTag = document.createElement("div");
    topTag.id = "mf-top-series-tag";
    const isHi = info.voice?.startsWith("hi-") || info.id?.endsWith("-hi");
    const partLabel = isHi ? `भाग ${info.part} / ${info.totalParts}` : `Part ${info.part} of ${info.totalParts}`;
    topTag.innerHTML = `MediFlow Guides · <span>${partLabel}</span>`;
    document.body.appendChild(topTag);

    // HUD container
    const hud = document.createElement("div");
    hud.id = "mf-tutorial-hud";
    document.body.appendChild(hud);

    // Captions bar
    const captions = document.createElement("div");
    captions.id = "mf-tutorial-captions";
    captions.style.opacity = "0";
    document.body.appendChild(captions);

    (window as any).__showKeyBadge = (key: string, label: string) => {
      hud.innerHTML = `
        <div class="mf-hud-badge active">
          <span class="mf-hud-key">${key}</span>
          <span>${label}</span>
        </div>
      `;
    };

    (window as any).__clearKeyBadge = () => {
      hud.innerHTML = "";
    };

    (window as any).__showCaption = (text: string) => {
      captions.innerText = text;
      captions.style.opacity = "1";
    };

    (window as any).__clearCaption = () => {
      captions.style.opacity = "0";
    };
  }, manifest);
}

async function record() {
  const manifestArg = process.argv[2] || "manifests/VID-1.1.json";
  const manifestPath = path.isAbsolute(manifestArg) ? manifestArg : path.join(PIPELINE_DIR, manifestArg);
  if (!fs.existsSync(manifestPath)) {
    console.error(`Error: Manifest not found at ${manifestPath}`);
    process.exit(1);
  }

  const manifest: Manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const baseId = manifest.id.replace(/-hi$/, "");
  const scenarioConfig = scenarioRegistry[baseId];

  if (!scenarioConfig) {
    console.error(`Error: No scenario runner registered for ID '${baseId}'`);
    process.exit(1);
  }

  const outputDir = path.join(process.cwd(), "recordings/tutorials", manifest.id);
  const timingsPath = path.join(outputDir, "scene_timings.json");
  const rawVideoDir = path.join(outputDir, "raw");
  const authStatePath = path.join(outputDir, "auth_state.json");

  fs.mkdirSync(rawVideoDir, { recursive: true });

  // Clean old raw webm files
  for (const f of fs.readdirSync(rawVideoDir)) {
    if (f.endsWith(".webm")) {
      fs.unlinkSync(path.join(rawVideoDir, f));
    }
  }

  // 1. Prepare narration audio with per-scene timings
  console.log(`\n=======================================================`);
  console.log(`Preparing narration audio for ${manifest.id} (${manifest.voice})...`);
  console.log(`=======================================================`);
  execSync(`python3 "${path.join(PIPELINE_DIR, "prepare_audio.py")}" "${manifestPath}" "${outputDir}"`, {
    stdio: "inherit",
  });

  const timings: TimingsMetadata = JSON.parse(fs.readFileSync(timingsPath, "utf8"));
  const { durations, master_duration, scene_pads } = timings;
  console.log(`✓ Master narration duration: ${master_duration.toFixed(2)}s across ${durations.length} scenes.`);

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--window-size=1920,1080"],
  });

  // Step A: Pre-login if required by scenario
  let context: BrowserContext;
  if (scenarioConfig.preAuthRequired) {
    console.log("Authenticating cashier session (unrecorded)...");
    const authContext = await browser.newContext();
    const authPage = await authContext.newPage();
    await authPage.goto(`${BASE_URL}/login`);
    await authPage.fill('input[name="email"]', "admin@apollo.com");
    await authPage.fill('input[name="password"]', "admin123");
    await authPage.click('.bg-white form button[type="submit"]');
    await authPage.waitForURL("**/dashboard**", { timeout: 10000 });
    await authContext.storageState({ path: authStatePath });
    await authContext.close();
    console.log("✓ Authentication complete. Saved storageState.");

    context = await browser.newContext({
      storageState: authStatePath,
      viewport: { width: 1920, height: 1080 },
      recordVideo: {
        dir: rawVideoDir,
        size: { width: 1920, height: 1080 },
      },
      ignoreHTTPSErrors: true,
    });
  } else {
    console.log("Starting unauthenticated screencast recording directly...");
    context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      recordVideo: {
        dir: rawVideoDir,
        size: { width: 1920, height: 1080 },
      },
      ignoreHTTPSErrors: true,
    });
  }

  const tStart = Date.now();
  const page = await context.newPage();

  // Ensure overlay is reinjected on navigation
  const reInjectOverlay = async () => {
    try {
      await injectOverlay(page, manifest);
    } catch {
      // Ignore
    }
  };

  const ensureOverlay = async () => {
    try {
      const exists = await page.evaluate(() => !!document.getElementById("mf-tutorial-captions"));
      if (!exists) {
        await injectOverlay(page, manifest);
      }
    } catch {
      // Ignored
    }
  };

  let scene0StartOffsetSec = 0.0;

  // Helper bindings
  const playScene = async (sceneIndex: number, actionFn?: () => Promise<void>) => {
    const start = Date.now();
    if (sceneIndex === 0) {
      scene0StartOffsetSec = Math.max(0, (start - tStart) / 1000);
      console.log(`[TIMING] Scene 0 began at ${scene0StartOffsetSec.toFixed(3)}s from recording start.`);
    }
    await ensureOverlay();

    const cues: SubtitleCue[] = timings.scene_subtitles?.[sceneIndex] || [
      {
        start: sceneIndex === 0 ? 0.5 : 0.0,
        end: durations[sceneIndex],
        text: manifest.narration[sceneIndex].text,
      },
    ];

    const pad = scene_pads[sceneIndex] ?? 0.4;
    const targetDurationMs = Math.round((durations[sceneIndex] + pad) * 1000);

    console.log(
      `\n▶ Scene ${sceneIndex + 1}/${manifest.narration.length} (${(targetDurationMs / 1000).toFixed(2)}s, ${cues.length} subtitle cues)...`
    );

    // Dynamic millisecond-accurate subtitle stream matching spoken voice verbatim
    let cancelSubtitles = false;
    const subtitleLoop = (async () => {
      for (const cue of cues) {
        if (cancelSubtitles) break;
        const elapsedSec = (Date.now() - start) / 1000;
        const waitMs = Math.max(0, (cue.start - elapsedSec) * 1000);
        if (waitMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
        if (cancelSubtitles) break;
        await page.evaluate((t) => (window as any).__showCaption(t), cue.text).catch(() => {});
      }
    })();

    if (actionFn) {
      try {
        await actionFn();
      } catch (err) {
        console.warn(`Warning in Scene ${sceneIndex + 1} action:`, err);
      }
    }

    const elapsed = Date.now() - start;
    const remaining = Math.max(0, targetDurationMs - elapsed);
    console.log(`  Scene ${sceneIndex + 1}: Actions done in ${(elapsed / 1000).toFixed(2)}s. Holding for ${(remaining / 1000).toFixed(2)}s.`);
    if (remaining > 0) {
      await page.waitForTimeout(remaining);
    }

    cancelSubtitles = true;
    await subtitleLoop;
  };

  const showKeyBadge = async (key: string, label: string) => {
    await page.evaluate(({ k, l }) => (window as any).__showKeyBadge(k, l), { k: key, l: label });
  };

  const clearKeyBadge = async () => {
    await page.evaluate(() => (window as any).__clearKeyBadge());
  };

  const spotlight = async (selector: string) => {
    try {
      const loc = page.locator(selector).first();
      await loc.evaluate((el) => el.classList.add("mf-spotlight-highlight"), undefined, { timeout: 2500 });
    } catch (err) {
      console.warn(`Could not spotlight '${selector}':`, err);
    }
  };

  const clearSpotlight = async () => {
    await page.evaluate(() => {
      const els = document.querySelectorAll(".mf-spotlight-highlight");
      els.forEach((el) => el.classList.remove("mf-spotlight-highlight"));
    });
  };

  try {
    // When page navigates to dashboard after login, we need overlay re-injected!
    page.on("load", async () => {
      await reInjectOverlay();
    });

    const scenarioCtx: ScenarioContext = {
      page,
      manifest,
      durations,
      scenePads: scene_pads,
      playScene,
      showKeyBadge,
      clearKeyBadge,
      spotlight,
      clearSpotlight,
      baseUrl: BASE_URL,
    };

    // Run the specific scenario
    await scenarioConfig.runner(scenarioCtx);

    // Save pageReadyOffsetSec (exact time Scene 0 began)
    const timingsData = JSON.parse(fs.readFileSync(timingsPath, "utf8"));
    timingsData.pageReadyOffsetSec = scene0StartOffsetSec;
    fs.writeFileSync(timingsPath, JSON.stringify(timingsData, null, 2));
    console.log(`✓ Dynamically calibrated pageReadyOffsetSec: ${scene0StartOffsetSec.toFixed(3)}s`);

    console.log(`\n✓ Screencast recorded cleanly. Recorded in ${((Date.now() - tStart) / 1000).toFixed(2)}s.`);
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }
}

record().catch((err) => {
  console.error("Recording failed:", err);
  process.exit(1);
});
