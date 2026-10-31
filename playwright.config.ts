import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.PORT || "3010";
const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Sequential execution for deterministic test database state
  timeout: 60 * 1000,
  expect: {
    timeout: 15 * 1000,
  },
  reporter: process.env.CI
    ? [["html", { open: "never" }], ["list"]]
    : [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
  webServer: {
    command: process.env.SKIP_BUILD
      ? `npm run start -- -p ${PORT}`
      : `npm run build && npm run start -- -p ${PORT}`,
    url: `${BASE_URL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 180 * 1000,
    env: {
      PORT,
      APP_ENCRYPTION_KEY:
        process.env.APP_ENCRYPTION_KEY ||
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      CRON_SECRET: process.env.CRON_SECRET || "ci-test-cron-secret",
      SKIP_ENV_VALIDATION: "1",
    },
  },
});
