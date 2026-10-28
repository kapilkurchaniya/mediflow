import { chromium, type Page, type BrowserContext, type Browser } from "playwright";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

export interface TestStepResult {
  id: string;
  phase: string;
  description: string;
  status: "PASSED" | "FAILED" | "SKIPPED";
  timestamp: string; // MM:SS
  durationMs: number;
  error?: string;
  consoleErrors: string[];
}

export class TestSession {
  private startTime: number = 0;
  private consoleErrors: string[] = [];
  public results: TestStepResult[] = [];

  constructor(public suiteName: string) {}

  public startRecording() {
    this.startTime = Date.now();
    this.consoleErrors = [];
    this.results = [];
  }

  public getElapsedSeconds(): number {
    return Math.max(0, (Date.now() - this.startTime) / 1000);
  }

  public getFormattedTimestamp(): string {
    const totalSecs = Math.floor(this.getElapsedSeconds());
    const mins = Math.floor(totalSecs / 60).toString().padStart(2, "0");
    const secs = (totalSecs % 60).toString().padStart(2, "0");
    return `${mins}:${secs}`;
  }

  public hookPageLogs(page: Page) {
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        this.consoleErrors.push(text);
      }
    });
    page.on("pageerror", (err) => {
      this.consoleErrors.push(err.message || String(err));
    });
  }

  public clearConsoleErrors() {
    this.consoleErrors = [];
  }

  public getConsoleErrors(): string[] {
    return [...this.consoleErrors];
  }

  public async runStep(
    id: string,
    phase: string,
    description: string,
    action: () => Promise<void>
  ): Promise<TestStepResult> {
    const timestamp = this.getFormattedTimestamp();
    const stepStart = Date.now();
    const errorsBefore = this.consoleErrors.length;
    let status: "PASSED" | "FAILED" = "PASSED";
    let failureError: string | undefined;

    console.log(`[${timestamp}] RUNNING ${id} (${phase}): ${description}`);

    try {
      await action();
    } catch (err: unknown) {
      status = "FAILED";
      failureError = err instanceof Error ? err.message : String(err);
      console.error(`  -> FAILED: ${failureError}`);
    }

    const stepConsoleErrors = this.consoleErrors.slice(errorsBefore);
    if (stepConsoleErrors.length > 0 && status === "PASSED") {
      const severe = stepConsoleErrors.filter(
        (e) => !e.includes("favicon.ico") && !e.includes("Download the React DevTools") && !e.includes("404")
      );
      if (severe.length > 0) {
        status = "FAILED";
        failureError = `Console error: ${severe.join("; ")}`;
      }
    }

    const durationMs = Date.now() - stepStart;
    const res: TestStepResult = {
      id,
      phase,
      description,
      status,
      timestamp,
      durationMs,
      error: failureError,
      consoleErrors: stepConsoleErrors,
    };
    this.results.push(res);
    console.log(`  -> ${status} (${durationMs}ms)`);
    return res;
  }

  public saveResultsJson(filePath: string) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(this.results, null, 2), "utf8");
  }
}

export async function createRecordedBrowser(rawVideoDir: string): Promise<{
  browser: Browser;
  context: BrowserContext;
  page: Page;
}> {
  fs.mkdirSync(rawVideoDir, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    recordVideo: {
      dir: rawVideoDir,
      size: { width: 1366, height: 768 },
    },
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();
  return { browser, context, page };
}

export function convertWebmToMp4(rawVideoDir: string, mp4Path: string) {
  console.log(`Looking for recorded webm in ${rawVideoDir}...`);
  const files = fs.readdirSync(rawVideoDir).filter((f) => f.endsWith(".webm"));
  if (files.length === 0) {
    throw new Error(`No .webm video found in ${rawVideoDir}`);
  }

  // Pick the latest / largest webm file
  const webmFile = files.sort((a, b) => {
    return fs.statSync(path.join(rawVideoDir, b)).size - fs.statSync(path.join(rawVideoDir, a)).size;
  })[0];

  const webmPath = path.join(rawVideoDir, webmFile);
  console.log(`Converting ${webmPath} to ${mp4Path}...`);
  fs.mkdirSync(path.dirname(mp4Path), { recursive: true });

  execSync(
    `ffmpeg -y -i "${webmPath}" -c:v libx264 -pix_fmt yuv420p -preset fast -crf 23 -movflags +faststart "${mp4Path}"`,
    { stdio: "inherit" }
  );
  console.log(`Successfully generated ${mp4Path}`);
}
