import { db } from "@/lib/db";
import { z } from "zod";
import { route, parseJson, parseQuery, notFound, badRequest } from "@/lib/server/api";
import { createDisputeSchema } from "@/lib/validation";
import { checkPublicUrl } from "@/lib/evidence/safe-url";
import { activity, audit, notify } from "@/lib/server/audit";

export const GET = route({}, async ({ req }) => {
  const { status } = parseQuery(req, z.object({ status: z.enum(["SUBMITTED", "UNDER_REVIEW", "EVIDENCE_REQUESTED", "RESOLVED", "REJECTED"]).optional() }));
  return db.dispute.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      market: { select: { id: true, question: true, isDemo: true, status: true, proposedOutcome: true } },
      challenger: { select: { name: true } },
      reviewer: { select: { name: true } },
      _count: { select: { evidence: true, comments: true } },
    },
  });
});

/** Challenge a proposed resolution or an interim recommendation. */
export const POST = route({ permission: "dispute:create" }, async ({ req, user, ip }) => {
  const body = await parseJson(req, createDisputeSchema);
  const market = await db.market.findUnique({ where: { id: body.marketId }, include: { recommendations: { orderBy: { createdAt: "desc" }, take: 1 } } });
  if (!market) throw notFound("Market");
  if (["RESOLVED", "CANCELLED", "DRAFT"].includes(market.status)) throw badRequest(`A ${market.status.toLowerCase()} market cannot be challenged.`);
  const recommendationId = body.recommendationId ?? market.recommendations[0]?.id ?? null;
  if (!recommendationId && market.status !== "RESOLUTION_PROPOSED") throw badRequest("There is no proposed resolution or recommendation to challenge yet.");
  if (recommendationId && !(await db.resolutionRecommendation.findFirst({ where: { id: recommendationId, marketId: market.id } })))
    throw badRequest("The referenced recommendation does not belong to this market.");
  for (const e of body.evidence) {
    const c = checkPublicUrl(e.sourceUrl);
    if (!c.ok) throw badRequest(`Evidence URL rejected: ${c.reason}`);
  }

  return db.$transaction(async (tx) => {
    const d = await tx.dispute.create({ data: { marketId: market.id, recommendationId, challengerId: user!.id, reason: body.reason, status: "SUBMITTED", isDemo: market.isDemo } });
    for (const e of body.evidence)
      await tx.evidence.create({
        data: { marketId: market.id, disputeId: d.id, submittedById: user!.id, title: e.title, sourceName: e.sourceName, sourceUrl: e.sourceUrl, description: e.description, publishedAt: e.publishedAt ? new Date(e.publishedAt) : null, category: e.category, claimedStance: e.claimedStance },
      });
    if (market.status === "RESOLUTION_PROPOSED") await tx.market.update({ where: { id: market.id }, data: { status: "DISPUTED" } });
    await activity(tx, { marketId: market.id, actorId: user!.id, type: "dispute.created", message: `Challenge submitted${body.evidence.length ? ` with ${body.evidence.length} evidence record(s)` : ""}` });
    await audit(tx, { actorId: user!.id, action: "dispute.create", entityType: "Dispute", entityId: d.id, metadata: { marketId: market.id, recommendationId }, ip });
    const reviewers = await tx.user.findMany({ where: { role: { in: ["REVIEWER", "ADMIN"] }, isDemo: false, id: { not: user!.id } }, select: { id: true }, take: 20 });
    for (const r of reviewers) await notify(tx, { userId: r.id, type: "dispute.created", title: "New dispute to review", body: market.question, link: `/disputes/${d.id}` });
    return d;
  });
});
