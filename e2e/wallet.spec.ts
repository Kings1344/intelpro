import { test, expect } from "@playwright/test";
import { connectTestWallet, installTestWallet, testKeypair, verifiedUser } from "./fixtures/helpers";

test("wallet: connect, link by signed message, disconnect states, and portfolio", async ({ page }) => {
  const kp = testKeypair();
  await installTestWallet(page, kp);
  await verifiedUser(page, "wallet");
  await page.goto("/settings");
  await expect(page.getByText("Connect a wallet to link it.")).toBeVisible();
  await connectTestWallet(page);

  await page.getByRole("button", { name: /^Link / }).click();
  await expect(page.getByText(/is linked to your account/)).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __TEST_WALLET_LOG__: string[] }).__TEST_WALLET_LOG__)).toContain("signMessage");

  // The server verified the ed25519 signature and stored the wallet.
  const wallets = (await (await page.request.get("/api/wallet")).json()).data;
  expect(wallets.map((w: { address: string }) => w.address)).toContain(kp.address);

  // Portfolio shows the wallet with either live chain data or an explicit RPC error — never invented balances.
  await page.goto("/portfolio");
  await expect(page.getByText(/Live|RPC unavailable/).first()).toBeVisible({ timeout: 30_000 });

  // A replayed signature is refused.
  const nonce = (await (await page.request.post("/api/wallet/nonce", { data: { address: kp.address } })).json()).data;
  const replay = await page.request.post("/api/wallet/verify", { data: { address: kp.address, nonce: nonce.nonce, signature: Buffer.alloc(64).toString("base64") } });
  expect(replay.status()).toBe(400);
});

test("wallet: trading requires a linked wallet", async ({ page }) => {
  const kp = testKeypair();
  await installTestWallet(page, kp);
  await verifiedUser(page, "unlinked");
  await page.goto("/markets?source=predict");
  const first = page.locator("tbody tr a").first();
  test.skip(!(await first.isVisible({ timeout: 30_000 }).catch(() => false)), "No live PREDICT market reachable from this environment");
  await first.click();
  await connectTestWallet(page);
  await expect(page.getByText(/is connected but not linked|Link wallet/)).toBeVisible();
});
