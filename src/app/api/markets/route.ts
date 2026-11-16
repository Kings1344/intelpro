import { route, parseJson, parseQuery } from "@/lib/server/api";
import { createMarketSchema, marketListQuery } from "@/lib/validation";
import { listMarkets } from "@/lib/services/markets";
import { createMarketWithCriteria } from "@/lib/services/criteria";

export const GET = route({}, async ({ req }) => {
  const q = parseQuery(req, marketListQuery);
  const rows = await listMarkets(q);
  return rows.map((m) => ({
    id: m.id,
    question: m.question,
    category: m.category,
    status: m.status,
    origin: m.origin,
    isDemo: m.isDemo,
    resolutionDeadline: m.resolutionDeadline,
    predictMarketPda: m.predictMarketPda,
    clarityScore: m.criteria[0]?.clarityScore ?? null,
    criteriaApproved: m.criteria[0]?.approved ?? false,
    evidenceCount: m.evidence.length,
    integrity: m.integrity,
    latestRecommendation: m.recommendations[0] ?? null,
  }));
});

export const POST = route({ permission: "market:create" }, async ({ req, user, ip }) => {
  const body = await parseJson(req, createMarketSchema);
  const market = await createMarketWithCriteria(user!, body, ip);
  return { id: market.id, status: market.status };
});
