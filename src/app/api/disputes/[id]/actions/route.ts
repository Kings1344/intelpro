import { db } from "@/lib/db";
import { route, parseJson, notFound, forbidden, badRequest } from "@/lib/server/api";
import { disputeActionSchema } from "@/lib/validation";
import { canReviewDispute } from "@/lib/auth/rbac";
import { checkPublicUrl } from "@/lib/evidence/safe-url";
import { activity, audit, notify } from "@/lib/server/audit";

const OPEN = ["SUBMITTED", "UNDER_REVIEW", "EVIDENCE_REQUESTED"];

/**
 * Reviewer workflow. This is an IntelPro review process recorded in the audit
 * trail — not a decentralised arbitration protocol.
 */
export const POST = route<{ id: string }>({ auth: true }, async ({ req, params, user, ip }) => {
  const action = await parseJson(req, disputeActionSchema);
  const d = await db.dispute.findUnique({ where: { id: params.id }, include: { market: true } });
  if (!d) throw notFound("Dispute");
  const u = user!;
  const isParty = u.id === d.challengerId || u.id === d.market.creatorId;
  const reviewer = canReviewDispute(u, d);
  if (!OPEN.includes(d.status) && action.action !== "comment") throw badRequest("This dispute is closed.");

  return db.$transaction(async (tx) => {
    const log = (act: string, metadata?: object) => audit(tx, { actorId: u.id, action: `dispute.${act}`, entityType: "Dispute", entityId: d.id, metadata: metadata as never, ip });

    switch (action.action) {
      case "start_review": {
        if (!reviewer) throw forbidden("Only a reviewer who did not raise this dispute can review it.");
        await tx.dispute.update({ where: { id: d.id }, data: { status: "UNDER_REVIEW", reviewerId: u.id } });
        await tx.disputeComment.create({ data: { disputeId: d.id, authorId: u.id, kind: "STATUS_CHANGE", body: "Review started." } });
        await log("start_review");
        break;
      }
      case "comment": {
        if (!isParty && !reviewer && u.role !== "ADMIN") throw forbidden("Only the parties and reviewers can comment.");
        await tx.disputeComment.create({ data: { disputeId: d.id, authorId: u.id, kind: "COMMENT", body: action.body } });
        await log("comment");
        break;
      }
      case "request_evidence": {
        if (!reviewer) throw forbidden("Only a reviewer can request evidence.");
        await tx.dispute.update({ where: { id: d.id }, data: { status: "EVIDENCE_REQUESTED", reviewerId: d.reviewerId ?? u.id } });
        await tx.disputeComment.create({ data: { disputeId: d.id, authorId: u.id, kind: "EVIDENCE_REQUEST", body: action.body } });
        await notify(tx, { userId: d.challengerId, type: "dispute.evidence_requested", title: "Additional evidence requested", body: action.body.slice(0, 200), link: `/disputes/${d.id}` });
        await log("request_evidence");
        break;
      }
      case "add_evidence": {
        if (u.id !== d.challengerId && !reviewer) throw forbidden("Only the challenger or a reviewer can attach evidence.");
        const c = checkPublicUrl(action.evidence.sourceUrl);
        if (!c.ok) throw badRequest(`Evidence URL rejected: ${c.reason}`);
        const e = action.evidence;
        const ev = await tx.evidence.create({
          data: { marketId: d.marketId, disputeId: d.id, submittedById: u.id, title: e.title, sourceName: e.sourceName, sourceUrl: c.url.toString(), description: e.description, publishedAt: e.publishedAt ? new Date(e.publishedAt) : null, category: e.category, claimedStance: e.claimedStance },
        });
        if (d.status === "EVIDENCE_REQUESTED") await tx.dispute.update({ where: { id: d.id }, data: { status: "UNDER_REVIEW" } });
        await tx.disputeComment.create({ data: { disputeId: d.id, authorId: u.id, kind: "COMMENT", body: `Attached evidence: ${e.title}` } });
        await activity(tx, { marketId: d.marketId, actorId: u.id, type: "evidence.submitted", message: `Dispute evidence submitted: ${e.title}` });
        await log("add_evidence", { evidenceId: ev.id });
        break;
      }
      case "decide": {
        if (!reviewer) throw forbidden("Only a reviewer who did not raise this dispute can decide it.");
        const upheld = action.decision === "UPHOLD";
        await tx.dispute.update({ where: { id: d.id }, data: { status: upheld ? "RESOLVED" : "REJECTED", decision: action.body, decidedAt: new Date(), reviewerId: u.id } });
        await tx.disputeComment.create({ data: { disputeId: d.id, authorId: u.id, kind: "DECISION", body: `${upheld ? "Challenge upheld" : "Challenge rejected"}: ${action.body}` } });
        const others = await tx.dispute.count({ where: { marketId: d.marketId, id: { not: d.id }, status: { in: OPEN as never } } });
        if (!others) {
          if (upheld && ["DISPUTED", "RESOLUTION_PROPOSED"].includes(d.market.status))
            await tx.market.update({ where: { id: d.marketId }, data: { status: "AWAITING_RESOLUTION", proposedOutcome: null } });
          else if (!upheld && d.market.status === "DISPUTED")
            await tx.market.update({ where: { id: d.marketId }, data: { status: "RESOLUTION_PROPOSED" } });
        }
        await activity(tx, { marketId: d.marketId, actorId: u.id, type: "dispute.decided", message: `Dispute ${upheld ? "upheld — proposed outcome withdrawn" : "rejected — proposal stands"}` });
        await notify(tx, { userId: d.challengerId, type: "dispute.decided", title: upheld ? "Your challenge was upheld" : "Your challenge was rejected", body: action.body.slice(0, 200), link: `/disputes/${d.id}` });
        await log("decide", { decision: action.decision });
        break;
      }
    }
    return tx.dispute.findUnique({ where: { id: d.id }, select: { id: true, status: true } });
  });
});
