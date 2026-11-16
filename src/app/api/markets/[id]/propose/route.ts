import { db } from "@/lib/db";
import { route, parseJson, notFound, badRequest } from "@/lib/server/api";
import { proposeResolutionSchema } from "@/lib/validation";
import { activity, audit, notify } from "@/lib/server/audit";

/**
 * A human reviewer proposes an outcome inside IntelPro, opening the challenge
 * window. This is NOT on-chain settlement: the market's designated resolution
 * mechanism (for PREDICT: the market authority's `resolve_market`) remains responsible.
 */
export const POST = route<{ id: string }>({ permission: "market:propose_resolution" }, async ({ req, params, user, ip }) => {
  const { outcome, recommendationId } = await parseJson(req, proposeResolutionSchema);
  const market = await db.market.findUnique({ where: { id: params.id }, include: { disputes: { where: { status: { in: ["SUBMITTED", "UNDER_REVIEW", "EVIDENCE_REQUESTED"] } } } } });
  if (!market) throw notFound("Market");
  if (["RESOLVED", "CANCELLED", "DRAFT"].includes(market.status)) throw badRequest(`Cannot propose a resolution for a ${market.status.toLowerCase()} market.`);
  if (market.disputes.length) throw badRequest("Resolve open disputes before proposing a new outcome.");
  const rec = await db.resolutionRecommendation.findFirst({ where: { id: recommendationId, marketId: market.id } });
  if (!rec) throw badRequest("The referenced recommendation does not belong to this market.");
  if (!market.resolutionDeadline || market.resolutionDeadline > new Date()) throw badRequest("The resolution deadline has not passed yet.");

  return db.$transaction(async (tx) => {
    const m = await tx.market.update({ where: { id: market.id }, data: { status: "RESOLUTION_PROPOSED", proposedOutcome: outcome } });
    await activity(tx, { marketId: market.id, actorId: user!.id, type: "resolution.proposed", message: `Resolution proposed: ${outcome} (based on recommendation ${rec.id.slice(-6)})`, metadata: { recommendationId: rec.id, aiRecommendation: rec.recommendation } });
    await audit(tx, { actorId: user!.id, action: "resolution.propose", entityType: "Market", entityId: market.id, metadata: { outcome, recommendationId: rec.id }, ip });
    if (market.creatorId) await notify(tx, { userId: market.creatorId, type: "resolution.proposed", title: `Resolution proposed: ${outcome}`, body: market.question, link: `/resolution/${market.id}` });
    return { id: m.id, status: m.status, proposedOutcome: m.proposedOutcome };
  });
});
