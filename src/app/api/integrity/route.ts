import { route, parseQuery } from "@/lib/server/api";
import { marketListQuery } from "@/lib/validation";
import { listMarkets } from "@/lib/services/markets";

export const GET = route({}, async ({ req }) => {
  const rows = await listMarkets(parseQuery(req, marketListQuery));
  return rows.map((m) => ({ id: m.id, question: m.question, category: m.category, status: m.status, isDemo: m.isDemo, resolutionDeadline: m.resolutionDeadline, ...m.integrity }));
});
