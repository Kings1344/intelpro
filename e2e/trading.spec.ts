/**
 * Real devnet trading through the UI: launch a PREDICT market, buy YES, sell YES.
 * Requires E2E_DEVNET=1, devnet RPC access, SOL airdrops and the mUSDC faucet.
 * Uses a throwaway keypair generated for this run.
 */
import { test, expect } from "@playwright/test";
import { approvedMarket, connectTestWallet, installTestWallet, testKeypair, verifiedUser } from "./fixtures/helpers";

const RPC = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const FAUCET = process.env.NEXT_PUBLIC_PM_AMM_FAUCET_URL ?? "https://pm-amm-devnet.vercel.app/api/faucet";

async function rpc(method: string, params: unknown[]) {
  const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const j = await r.json();
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result;
}

test.describe("devnet trading", () => {
  test.skip(process.env.E2E_DEVNET !== "1", "Set E2E_DEVNET=1 to run real devnet trading tests");
  test.setTimeout(300_000);

  test("launch a PREDICT market, buy YES, then sell YES — all confirmed on devnet", async ({ page }) => {
    const kp = testKeypair();
    const sig = await rpc("requestAirdrop", [kp.address, 1_000_000_000]);
    await expect.poll(async () => (await rpc("getSignatureStatuses", [[sig]])).value[0]?.confirmationStatus ?? null, { timeout: 60_000 }).toMatch(/confirmed|finalized/);
    const faucet = await fetch(FAUCET, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet: kp.address }) });
    expect(faucet.ok, `mUSDC faucet responded ${faucet.status}`).toBeTruthy();

    await installTestWallet(page, kp);
    await verifiedUser(page, "trader");
    await page.goto("/settings");
    await connectTestWallet(page);
    await page.getByRole("button", { name: /^Link / }).click();
    await expect(page.getByText(/is linked to your account/)).toBeVisible();

    const id = await approvedMarket(page, `Will the E2E run ${Date.now()} finish before December 31, 2027?`);
    await page.goto(`/markets/${id}`);
    await page.getByLabel("Liquidity (mUSDC)").fill("50");
    await page.getByRole("button", { name: "Launch on PREDICT" }).click();
    await expect(page.getByText("Launched on PREDICT and linked")).toBeVisible({ timeout: 120_000 });
    await page.getByRole("link", { name: "Trade and view prices" }).click();

    const panel = page.getByTestId("trade-panel");
    await expect(panel.getByText(/Balance: .*mUSDC/)).toBeVisible({ timeout: 30_000 });
    await panel.getByLabel(/Amount/).fill("5");
    await expect(panel.getByTestId("quote")).toContainText("You receive");
    await panel.getByRole("button", { name: "Buy YES" }).last().click();
    await expect(panel.getByTestId("last-tx")).toContainText(/confirmed|finalized/, { timeout: 120_000 });
    expect(await page.evaluate(() => (window as unknown as { __TEST_WALLET_LOG__: string[] }).__TEST_WALLET_LOG__)).toContain("signTransaction");

    await panel.getByRole("tab", { name: "sell" }).click();
    await expect(panel.getByText(/Balance: [1-9][\d,.]* YES tokens/)).toBeVisible({ timeout: 30_000 });
    await panel.getByRole("button", { name: "Max" }).click();
    await expect(panel.getByTestId("quote")).toContainText("mUSDC");
    await panel.getByRole("button", { name: "Sell YES" }).last().click();
    await expect(panel.getByTestId("last-tx")).toContainText(/confirmed|finalized/, { timeout: 120_000 });
    await expect(panel.getByText(/Balance: 0 YES tokens/)).toBeVisible({ timeout: 30_000 });

    // The server recorded both swaps as verified on-chain transactions.
    const txs = (await (await page.request.get("/api/transactions")).json()).data as { kind: string; status: string }[];
    expect(txs.filter((t) => t.kind === "PREDICT_SWAP" && /CONFIRMED|FINALIZED/.test(t.status)).length).toBeGreaterThanOrEqual(2);
  });
});
