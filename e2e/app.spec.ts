import { test, expect } from "@playwright/test";
import { approvedMarket, login, verifiedUser } from "./fixtures/helpers";

const ADMIN = { email: process.env.SEED_ADMIN_EMAIL ?? "admin@intelpro.dev", password: process.env.SEED_ADMIN_PASSWORD ?? "change-me-now-123" };

test("dashboard shows consistent, labelled demo data and every sidebar section loads", async ({ page }) => {
  await login(page, ADMIN.email, ADMIN.password);
  await page.waitForURL("**/markets");
  await page.goto("/overview");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByText("Lockline Intelligence Feed")).toBeVisible();
  await expect(page.getByText("Demo data").first()).toBeVisible();

  // "Markets monitored" equals the number of rows in the Market Explorer.
  const monitored = Number(await page.locator("a", { hasText: "Markets monitored" }).locator("p").nth(1).innerText());
  await page.goto("/markets");
  await expect(page.locator("tbody tr")).toHaveCount(monitored);

  for (const [label, heading] of [["Write rules", "Write rules"], ["Markets", "Markets"], ["Resolve", "Resolve"], ["Settings", "Settings"]]) {
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: label }).click();
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    await expect(page.getByText("This page could not load")).toHaveCount(0);
  }
});

test("market discovery: filters, market selection and live PREDICT tab never shows simulated data", async ({ page }) => {
  await page.goto("/markets");
  await page.getByLabel("Integrity").selectOption("UNDER_DISPUTE");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(/integrity=UNDER_DISPUTE/);
  const rows = page.locator("tbody tr");
  await expect(rows.first()).toContainText("Under dispute");
  await rows.first().getByRole("link").first().click();
  await expect(page.getByText(/Approved resolution rules|Resolution rules \(not approved\)/).first()).toBeVisible();
  await expect(page.getByText("Integrity", { exact: true })).toBeVisible();

  await page.goto("/markets?source=predict");
  // Either live data from Solana, or an explicit "not reachable" state — never placeholder rows.
  await expect(page.getByText(/Live on PREDICT devnet|PREDICT not reachable/).first()).toBeVisible({ timeout: 30_000 });
  if (await page.getByText("PREDICT not reachable").isVisible()) await expect(page.locator("tbody tr")).toHaveCount(0);
});

test("Market Architect: flags the question, blocks inconsistent rules, then creates an approved market", async ({ page }) => {
  await verifiedUser(page, "architect");
  await page.goto("/architect");
  await page.getByLabel("Market question").fill("Will Bitcoin reach $150,000 before December 31, 2027?");
  await page.getByRole("button", { name: "Analyse question" }).click();
  await expect(page.getByText("Heuristic engine, not AI").first()).toBeVisible();
  await expect(page.getByText(/No resolution data source is named/)).toBeVisible();

  const no = page.getByLabel("Resolves NO if");
  const original = await no.inputValue();
  await no.fill("Resolves NO if BTC stays below $140,000.");
  await expect(page.getByText(/does not match the threshold/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve rules and create market" })).toBeDisabled();

  await no.fill(original);
  await page.getByRole("button", { name: "Approve rules and create market" }).click();
  await page.waitForURL(/\/markets\/[a-z0-9]+$/);
  await expect(page.getByText(/Approved resolution rules, v1/).first()).toBeVisible();
  // The lock strip shows approval done and the on-chain lock still to do; no verify button without a lock.
  const lock = page.getByRole("region", { name: "Rules lock" });
  await expect(lock.getByText("Version 1")).toBeVisible();
  await expect(lock.getByText("Not locked yet.")).toBeVisible();
  await expect(lock.getByRole("button", { name: "Verify on-chain" })).toHaveCount(0);
});

test("lock check endpoint reports an unlocked market honestly", async ({ page }) => {
  await verifiedUser(page, "lockcheck");
  const id = await approvedMarket(page);
  const res = await page.request.get(`/api/markets/${id}/verify-lock`);
  expect(res.status()).toBe(200);
  const v = (await res.json()).data;
  expect(v.state).toBe("unlocked");
  expect(v.currentHash).toMatch(/^[0-9a-f]{64}$/);
});

test("resolution: recommendation cites only stored evidence and is labelled as advisory", async ({ page }) => {
  await login(page, ADMIN.email, ADMIN.password);
  await page.waitForURL("**/markets");
  await page.goto("/resolution");
  await page.getByRole("link", { name: /Bitcoin reach \$150,000|BTC\/USD price published by CoinGecko reach or exceed \$150,000/ }).first().click();
  await page.getByRole("button", { name: "Generate recommendation" }).click();
  await expect(page.getByText("Recommendation generated")).toBeVisible();
  await expect(page.getByText(/advisory and traceable to stored evidence/)).toBeVisible();
  await expect(page.getByText("Heuristic engine, not AI").first()).toBeVisible();
  const cited = page.getByRole("heading", { name: /Cited evidence/ });
  await expect(cited).toBeVisible();
});

test("approved markets can be created through the API helper used by other specs", async ({ page }) => {
  await verifiedUser(page, "helper");
  const id = await approvedMarket(page);
  await page.goto(`/markets/${id}`);
  await expect(page.getByText(/Approved resolution rules, v1/).first()).toBeVisible();
});
