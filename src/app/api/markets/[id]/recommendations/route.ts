import { db } from "@/lib/db";
import { route, notFound, badRequest } from "@/lib/server/api";
import { recommendResolution } from "@/lib/ai/resolution";
import { latestApproved } from "@/lib/services/markets";
import { limiters } from "@/lib/server/rate-limit";
import { activity, audit } from "@/lib/server/audit";
import type { Category } from "@/lib/ai/resolution-rules";
import { recLabel } from "@/lib/utils";

export const GET = route<{ id: string }>({}, async ({ params }) =>
  db.resolutionRecommendation.findMany({ where: { marketId: params.id }, orderBy: { createdAt: "desc" } }),
);

/**
 * Generates an advisory recommendation from stored evidence only. It never
 * changes market status, settles anything, or moves funds.
 */
export const POST = route<{ id: string }>({ permission: "resolution:generate", limiter: limiters.ai }, async ({ params, user, ip }) => {
  const market = await db.market.findUnique({
    where: { id: params.id },
    include: {
      criteria: { orderBy: { version: "desc" } },
      evidence: { include: { analyses: { orderBy: { createdAt: "desc" }, take: 1 } } },
    },
  });
  if (!market) throw notFound("Market");
  const criteria = latestApproved(market.criteria);
  if (!criteria) throw badRequest("Approve resolution criteria before generating a recommendation.");

  const result = await recommendResolution({
    criteria: {
      improvedQuestion: criteria.improvedQuestion,
      yesCondition: criteria.yesCondition,
      noCondition: criteria.noCondition,
      resolutionDeadline: criteria.resolutionDeadline.toISOString(),
      dataSource: criteria.dataSource,
      methodology: criteria.methodology,
    },
    evidence: market.evidence.map((e) => {
      const a = e.analyses[0];
      return {
        id: e.id,
        title: e.title,
        category: e.category as Category,
        accessible: a?.sourceAccessible ?? false,
        stance: a?.stance ?? null,
        relevance: a?.relevance ?? 0,
        status: e.status,
        sourceName: e.sourceName,
        sourceUrl: e.sourceUrl,
        publishedAt: e.publishedAt?.toISOString() ?? null,
        summary: a?.summary ?? null,
        claims: (a?.claims as { text: string; supports: string }[]) ?? [],
      };
    }),
  });

  return db.$transaction(async (tx) => {
    const rec = await tx.resolutionRecommendation.create({
      data: {
        marketId: market.id,
        criteriaId: criteria.id,
        requestedById: user!.id,
        recommendation: result.recommendation,
        confidence: result.confidence,
        reasoning: result.aiError ? `${result.reasoning}\n\nAI unavailable: ${result.aiError}` : result.reasoning,
        uncertainty: result.uncertainty,
        missingInformation: result.missingInformation,
        citedEvidenceIds: result.citedEvidenceIds,
        rejectedCitations: result.rejectedCitations,
        engine: result.engine,
        model: result.model,
        isDemo: market.isDemo,
      },
    });
    await activity(tx, { marketId: market.id, actorId: user!.id, type: "resolution.recommended", message: `Recommendation (${result.engine === "AI" ? "AI" : "heuristic engine"}): ${recLabel(result.recommendation)}` });
    await audit(tx, { actorId: user!.id, action: "resolution.recommend", entityType: "ResolutionRecommendation", entityId: rec.id, metadata: { engine: result.engine, recommendation: result.recommendation, rejected: result.rejectedCitations.length }, ip });
    return rec;
  });
});
