import { test, expect } from "@playwright/test";
import { approvedMarket, fixturePath, verifiedUser } from "./fixtures/helpers";

async function fillMeta(page: import("@playwright/test").Page, title: string) {
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Source name").fill("E2E source");
  await page.getByLabel("Description").fill("Submitted by the end-to-end test suite.");
}

test("URL evidence is recorded as submitted, then retrieved and analysed by the labelled rules engine", async ({ page }) => {
  await verifiedUser(page, "evidence");
  const id = await approvedMarket(page);
  await page.goto(`/evidence/${id}`);
  await fillMeta(page, "IANA example domain");
  await page.getByLabel("Source URL").fill("https://example.com/");
  await page.getByRole("button", { name: "Submit evidence" }).click();
  await expect(page.getByText("Evidence submitted")).toBeVisible();
  const card = page.locator("article", { hasText: "IANA example domain" });
  await expect(card.getByText("Submitted", { exact: true }).first()).toBeVisible();

  await card.getByRole("button", { name: "Retrieve and analyse" }).click();
  // Real network: either analysed (heuristic, never a YES/NO stance) or honestly unverifiable.
  await expect(card.getByText(/^(Analysed|Unable to verify)$/)).toBeVisible({ timeout: 30_000 });
  if (await card.getByText("Analysed", { exact: true }).isVisible()) {
    await expect(card.getByText("Heuristic engine, not AI")).toBeVisible();
    await expect(card.getByText("Unclassified").last()).toBeVisible();
  }
});

test("private-network URLs are rejected (SSRF protection)", async ({ page }) => {
  await verifiedUser(page, "ssrf");
  const id = await approvedMarket(page);
  const res = await page.request.post(`/api/markets/${id}/evidence`, {
    data: { title: "Metadata", sourceName: "x", sourceUrl: "http://169.254.169.254/latest/meta-data", description: "attempted internal fetch", category: "OTHER" },
  });
  expect(res.status()).toBe(422);
  expect(JSON.stringify(await res.json())).toMatch(/Private or reserved/);
});

test("PDF evidence: text PDFs are read and analysed; scanned PDFs are stored but reported unreadable", async ({ page }) => {
  await verifiedUser(page, "pdf");
  const id = await approvedMarket(page);
  await page.goto(`/evidence/${id}`);

  await page.getByRole("tab", { name: "Upload a PDF" }).click();
  await fillMeta(page, "Exchange report PDF");
  await page.getByLabel("PDF file").setInputFiles(fixturePath("evidence-text.pdf"));
  await page.getByRole("button", { name: "Upload PDF" }).click();
  await expect(page.getByTestId("pdf-result")).toContainText(/Read \d+ characters from 2 page/);
  const card = page.locator("article", { hasText: "Exchange report PDF" });
  await expect(card.getByText("Accessible", { exact: true })).toBeVisible();
  await expect(card.getByTestId("pdf-download")).toHaveText("evidence-text.pdf");
  const dl = await page.request.get(await card.getByTestId("pdf-download").getAttribute("href") as string);
  expect(dl.headers()["content-disposition"]).toContain("attachment");
  expect((await dl.body()).subarray(0, 5).toString()).toBe("%PDF-");

  await card.getByRole("button", { name: "Analyse PDF text" }).click();
  await expect(card.getByText("Analysed", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(card.getByText("Heuristic engine, not AI")).toBeVisible();

  await page.getByRole("tab", { name: "Upload a PDF" }).click();
  await fillMeta(page, "Scanned letter");
  await page.getByLabel("PDF file").setInputFiles(fixturePath("evidence-image-only.pdf"));
  await page.getByRole("button", { name: "Upload PDF" }).click();
  await expect(page.getByTestId("pdf-result")).toContainText(/no text layer/);
  await expect(page.locator("article", { hasText: "Scanned letter" }).getByText("Unable to verify", { exact: true })).toBeVisible();
});

test("PDF upload rejects files that are not PDFs", async ({ page }) => {
  await verifiedUser(page, "pdfbad");
  const id = await approvedMarket(page);
  await page.goto(`/evidence/${id}`);
  await page.getByRole("tab", { name: "Upload a PDF" }).click();
  await fillMeta(page, "Disguised HTML");
  await page.getByLabel("PDF file").setInputFiles({ name: "fake.pdf", mimeType: "application/pdf", buffer: Buffer.from("<html><script>alert(1)</script></html>") });
  await page.getByRole("button", { name: "Upload PDF" }).click();
  await expect(page.getByText(/not a PDF/)).toBeVisible();
  await expect(page.locator("article", { hasText: "Disguised HTML" })).toHaveCount(0);
});
