import { defineConfig, devices } from "@playwright/test";

/**
 * Browser end-to-end tests against the real production build + a real PostgreSQL database.
 * Emails go to the E2E outbox (EMAIL_TRANSPORT=outbox, E2E_TEST_MODE=1, localhost only).
 * Devnet trading specs run only with E2E_DEVNET=1 (they need Solana devnet + the mUSDC faucet).
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }], ["junit", { outputFile: "test-results/e2e-junit.xml" }]] : "list",
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, grepInvert: /@mobile/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, grep: /@mobile/ },
  ],
  webServer: {
    command: process.env.E2E_SERVER_COMMAND ?? `npx next start -p ${PORT}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      APP_URL: baseURL,
      E2E_TEST_MODE: "1",
      EMAIL_TRANSPORT: "outbox",
      EMAIL_OUTBOX_PATH: process.env.EMAIL_OUTBOX_PATH ?? "test-results/outbox.json",
      ANTHROPIC_API_KEY: "", // exercise the labelled no-AI fallback
    },
  },
});
