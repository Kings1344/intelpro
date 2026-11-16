import { route, notFound } from "@/lib/server/api";
import { getMarketDetail, detailIntegrity } from "@/lib/services/markets";
import { getPredictMarket } from "@/lib/predict/server";

export const GET = route<{ id: string }>({}, async ({ params }) => {
  const m = await getMarketDetail(params.id);
  if (!m) throw notFound("Market");
  const predict = m.predictMarketPda ? await getPredictMarket(m.predictMarketPda) : null;
  return detailIntegrity(m, predict?.endTs ?? null);
});
