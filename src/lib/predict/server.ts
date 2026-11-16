import "server-only";
/**
 * PREDICT pm-AMM — server-side discovery service (read-only).
 *
 * Uses the official @pm-amm/sdk (`PmAmmClient.fromProvider` + `fetchAllMarkets(443)`)
 * with a read-only provider whose wallet refuses to sign. All values shown in the UI
 * as "Live · PREDICT devnet" come from here; nothing is mocked.
 */
import { publicConfig } from "@/lib/config";
import { serverRpcUrl } from "@/lib/solana/server";
import { fetchTokenBalance } from "@/lib/solana/tx-verify";
import { logger } from "@/lib/server/logger";
import { normalizeMarket, type PredictMarketView, type MathFns } from "./normalize";

export type PredictStatus = { enabled: boolean; reachable: boolean; error: string | null; programId: string; network: string; checkedAt: string };

type Cache = { at: number; markets: PredictMarketView[]; status: PredictStatus };
let cache: Cache | null = null;
const TTL = 30_000;

async function readOnlyClient() {
  const [sdk, math, web3] = await Promise.all([import("@pm-amm/sdk"), import("@pm-amm/sdk/math"), import("@solana/web3.js")]);
  const connection = new web3.Connection(serverRpcUrl(), "confirmed");
  // `PmAmmClient.readOnly` (client.ts) builds a client without a provider: it can read and
  // build instructions but cannot sign, so the server never holds or uses a key.
  const client = sdk.PmAmmClient.readOnly(connection, new web3.PublicKey(publicConfig.predict.programId), new web3.PublicKey(publicConfig.predict.usdcMint));
  return { client, math: { i80f48ToNumber: math.i80f48ToNumber, priceFromReserves: math.priceFromReserves } as MathFns, web3 };
}

export async function discoverPredictMarkets(opts: { force?: boolean } = {}): Promise<{ markets: PredictMarketView[]; status: PredictStatus }> {
  const base = { programId: publicConfig.predict.programId, network: publicConfig.solana.network, checkedAt: new Date().toISOString() };
  if (process.env.PREDICT_ENABLED === "false") {
    return { markets: [], status: { ...base, enabled: false, reachable: false, error: "PREDICT discovery disabled (PREDICT_ENABLED=false)." } };
  }
  if (!opts.force && cache && Date.now() - cache.at < TTL) return { markets: cache.markets, status: cache.status };
  try {
    const { client, math } = await readOnlyClient();
    const raw = (await client.fetchAllMarkets(publicConfig.predict.marketAccountSize)) as { publicKey: { toBase58(): string }; account: Record<string, unknown> }[];
    const now = new Date();
    const markets = raw
      .map((r) => normalizeMarket(r.publicKey.toBase58(), r.account, math, now))
      .sort((a, b) => (b.endTs?.getTime() ?? 0) - (a.endTs?.getTime() ?? 0));
    const status: PredictStatus = { ...base, enabled: true, reachable: true, error: null };
    cache = { at: Date.now(), markets, status };
    return { markets, status };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn("predict.discovery_failed", { err: msg.slice(0, 300) });
    return { markets: cache?.markets ?? [], status: { ...base, enabled: true, reachable: false, error: `PREDICT discovery failed: ${msg.slice(0, 200)}` } };
  }
}

export async function getPredictMarket(pda: string): Promise<PredictMarketView | null> {
  const { markets } = await discoverPredictMarkets();
  const hit = markets.find((m) => m.pda === pda);
  if (hit) return hit;
  try {
    const { client, math, web3 } = await readOnlyClient();
    const acct = await client.fetchMarket(new web3.PublicKey(pda));
    return acct ? normalizeMarket(pda, acct as unknown as Record<string, unknown>, math) : null;
  } catch {
    return null;
  }
}

/** Live collateral held by the market vault (mUSDC on devnet). */
export async function getVaultLiquidity(vault: string | null): Promise<number | null> {
  if (!vault) return null;
  try {
    const b = await fetchTokenBalance(serverRpcUrl(), vault);
    return b.uiAmount ?? Number(b.amount) / 10 ** b.decimals;
  } catch {
    return null;
  }
}
