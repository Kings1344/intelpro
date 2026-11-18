import { test, expect } from "@playwright/test";
import { noHorizontalOverflow, verifiedUser } from "./fixtures/helpers";

test("@mobile navigation drawer works and core pages fit the screen", async ({ page }) => {
  await verifiedUser(page, "mobile");
  for (const path of ["/overview", "/markets", "/architect", "/integrity", "/disputes", "/settings"]) {
    await page.goto(path);
    await noHorizontalOverflow(page);
  }
  await page.goto("/overview");
  await expect(page.getByRole("navigation", { name: "Main" })).not.toBeInViewport();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("navigation", { name: "Main" })).toBeInViewport();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Resolve" }).click();
  await expect(page.getByRole("heading", { name: "Resolve", level: 1 })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" })).not.toBeInViewport();
});

test("@mobile landing page and Market Architect fit a phone screen", async ({ page }) => {
  await page.goto("/");
  await noHorizontalOverflow(page);
  await verifiedUser(page, "mobile-arch");
  await page.goto("/architect");
  await page.getByLabel("Market question").fill("Will the Fed significantly cut rates soon?");
  await page.getByRole("button", { name: "Analyse question" }).click();
  await expect(page.getByRole("heading", { name: "Resolution rules" })).toBeVisible();
  await noHorizontalOverflow(page);
});

test("error states: unknown pages, unauthorised API calls and missing records", async ({ page }) => {
  await page.goto("/this-page-does-not-exist");
  await expect(page.getByText("Nothing at this address")).toBeVisible();
  const anon = await page.request.post("/api/disputes", { data: {} });
  expect(anon.status()).toBe(401);
  await page.goto("/markets/does-not-exist");
  await expect(page.getByText("Nothing at this address")).toBeVisible();
  const health = await (await page.request.get("/api/health")).json();
  expect(health.database).toBe("ok");
});
