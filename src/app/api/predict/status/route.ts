import { route } from "@/lib/server/api";
import { discoverPredictMarkets } from "@/lib/predict/server";
import { publicConfig } from "@/lib/config";

export const GET = route({}, async () => {
  const { status, markets } = await discoverPredictMarkets();
  return { ...status, usdcMint: publicConfig.predict.usdcMint, marketsDiscovered: markets.length, open: markets.filter((m) => m.phase === "open").length };
});
