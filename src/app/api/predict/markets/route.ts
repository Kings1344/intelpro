import { route } from "@/lib/server/api";
import { discoverPredictMarkets, getVaultLiquidity } from "@/lib/predict/server";

/** Live market discovery from the PREDICT pm-AMM program (devnet by default). */
export const GET = route({}, async ({ req }) => {
  const includeExpired = req.nextUrl.searchParams.get("expired") === "1";
  const { markets, status } = await discoverPredictMarkets({ force: req.nextUrl.searchParams.get("refresh") === "1" });
  const visible = markets.filter((m) => includeExpired || m.phase === "open").slice(0, 60);
  // Vault balances are fetched for the visible page only, to bound RPC load.
  const withLiquidity = await Promise.all(visible.slice(0, 30).map(async (m) => ({ ...m, liquidityUsdc: await getVaultLiquidity(m.vault) })));
  return { status, total: markets.length, markets: [...withLiquidity, ...visible.slice(30).map((m) => ({ ...m, liquidityUsdc: null }))] };
});
