import { route, notFound } from "@/lib/server/api";
import { getMarketDetail, detailIntegrity } from "@/lib/services/markets";

export const GET = route<{ id: string }>({}, async ({ params }) => {
  const m = await getMarketDetail(params.id);
  if (!m) throw notFound("Market");
  return { ...m, transactions: m.transactions.map((t) => ({ ...t, slot: t.slot?.toString() ?? null })), integrity: detailIntegrity(m) };
});
