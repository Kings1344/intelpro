import { expect, type Page, type APIRequestContext } from "@playwright/test";
import nacl from "tweetnacl";
import fs from "node:fs";
import path from "node:path";
import { base58Encode } from "../../src/lib/solana/base58";

export const PASSWORD = "e2e-Passw0rd-123";

export function uniqueEmail(tag: string) {
  return `e2e-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
}

/** A throwaway devnet keypair generated per test. Never a real or funded mainnet key. */
export function testKeypair() {
  const kp = nacl.sign.keyPair();
  return { seed: Array.from(kp.secretKey.slice(0, 32)), publicKey: Array.from(kp.publicKey), address: base58Encode(kp.publicKey), secretKey: kp.secretKey };
}

export async function installTestWallet(page: Page, kp: ReturnType<typeof testKeypair>) {
  await page.addInitScript(({ seed, pub, address }) => {
    Object.assign(window, { __TEST_WALLET_SEED__: seed, __TEST_WALLET_PUBKEY__: pub, __TEST_WALLET_ADDRESS__: address });
  }, { seed: kp.seed, pub: kp.publicKey, address: kp.address });
  await page.addInitScript({ path: path.join(__dirname, "test-wallet-page.js") });
}

export async function connectTestWallet(page: Page) {
  await page.getByRole("button", { name: /select wallet/i }).first().click();
  await page.getByRole("button", { name: /IntelPro Test Wallet/ }).click();
  await expect(page.getByRole("button", { name: /select wallet/i })).toHaveCount(0);
}

export async function register(page: Page, email: string, name = "E2E User") {
  await page.goto("/register");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/overview");
}

export async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Reads the newest email of a kind from the app's E2E outbox and returns the link inside it. */
export async function latestLink(request: APIRequestContext, to: string, kind: "verify_email" | "password_reset") {
  await expect.poll(async () => (await (await request.get(`/api/test/outbox?to=${encodeURIComponent(to)}`)).json()).data.filter((m: { kind: string }) => m.kind === kind).length, { timeout: 10_000 }).toBeGreaterThan(0);
  const { data } = await (await request.get(`/api/test/outbox?to=${encodeURIComponent(to)}`)).json();
  const mail = data.filter((m: { kind: string }) => m.kind === kind).at(-1);
  const m = mail.text.match(/https?:\/\/\S+/);
  if (!m) throw new Error("No link in email");
  const u = new URL(m[0]);
  return `${u.pathname}${u.search}`;
}

export async function verifyEmail(page: Page, email: string) {
  const link = await latestLink(page.request, email, "verify_email");
  await page.goto(link);
  await expect(page.getByTestId("verify-ok")).toBeVisible();
}

export async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "page must not scroll horizontally").toBeLessThanOrEqual(1);
}

export const fixture = (f: string) => fs.readFileSync(path.join(__dirname, "..", "..", "tests", "fixtures", f));
export const fixturePath = (f: string) => path.join(__dirname, "..", "..", "tests", "fixtures", f);

/** Registers through the UI and follows the real verification email. */
export async function verifiedUser(page: Page, tag: string) {
  const email = uniqueEmail(tag);
  await register(page, email);
  await verifyEmail(page, email);
  return email;
}

/** Creates an approved market through the real API (Market Architect analysis + approval checks). */
export async function approvedMarket(page: Page, question = "Will Bitcoin reach $150,000 before December 31, 2027?") {
  const a = await page.request.post("/api/architect/analyze", { data: { question } });
  expect(a.ok()).toBeTruthy();
  const r = (await a.json()).data;
  const res = await page.request.post("/api/markets", {
    data: {
      category: "Crypto",
      approve: true,
      criteria: {
        originalQuestion: r.originalQuestion, improvedQuestion: r.improvedQuestion, yesCondition: r.yesCondition, noCondition: r.noCondition,
        resolutionDeadline: r.resolutionDeadline, timezone: "UTC", dataSource: r.dataSource, dataSourceUrl: r.dataSourceUrl, methodology: r.methodology,
        clarityScore: r.clarityScore, issues: r.issues, engine: r.engine, model: r.model,
      },
    },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()).data.id as string;
}
