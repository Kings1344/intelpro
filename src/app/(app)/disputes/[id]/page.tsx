import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { canReviewDispute } from "@/lib/auth/rbac";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Notice, PageHeader } from "@/components/ui/misc";
import { DemoBadge, DisputeStatusBadge, RecommendationBadge, StanceBadge, EvidenceStatusBadge } from "@/components/domain/badges";
import { DisputeActions } from "./actions";
import { formatDateTime, cn } from "@/lib/utils";

export const metadata = { title: "Dispute" };

export default async function DisputePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [d, user] = await Promise.all([
    db.dispute.findUnique({
      where: { id },
      include: {
        market: { include: { criteria: { where: { approved: true }, take: 1 }, evidence: { where: { disputeId: null }, include: { analyses: { orderBy: { createdAt: "desc" }, take: 1 } } } } },
        recommendation: true,
        challenger: { select: { id: true, name: true } },
        reviewer: { select: { id: true, name: true } },
        evidence: { include: { analyses: { orderBy: { createdAt: "desc" }, take: 1 } } },
        comments: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true, role: true } } } },
      },
    }),
    getCurrentUser(),
  ]);
  if (!d) notFound();
  const audit = await db.auditLog.findMany({ where: { entityType: "Dispute", entityId: d.id }, orderBy: { createdAt: "asc" }, include: { actor: { select: { name: true } } } });
  const c = d.market.criteria[0];
  const open = ["SUBMITTED", "UNDER_REVIEW", "EVIDENCE_REQUESTED"].includes(d.status);
  const role = user ? { isReviewer: canReviewDispute(user, d), isChallenger: user.id === d.challengerId, isParty: user.id === d.challengerId || user.id === d.market.creatorId || user.role === "ADMIN" } : null;

  return (
    <>
      <PageHeader
        title={`Challenge to ${d.recommendation ? "a recommendation" : "the proposed resolution"}`}
        description={<Link href={`/markets/${d.marketId}`} className="hover:text-fg">{d.market.question}</Link>}
        meta={<><DisputeStatusBadge status={d.status} />{d.isDemo && <DemoBadge />}</>}
      />
      {d.isDemo && <Notice tone="amber" className="mb-5">Demonstration dispute between sample personas. Reviewers and administrators can act on it to try the workflow.</Notice>}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Challenge" description={`Submitted by ${d.challenger.name}, ${formatDateTime(d.createdAt)}`} />
            <CardBody className="space-y-4">
              <p className="whitespace-pre-line text-[14px] leading-relaxed text-fg">{d.reason}</p>
              <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
                Challenging:
                {d.recommendation ? <><RecommendationBadge value={d.recommendation.recommendation} /><span>generated {formatDateTime(d.recommendation.createdAt)}</span></> : <span>proposed outcome {d.market.proposedOutcome ?? "—"}</span>}
              </div>
              {c && <p className="text-[12.5px] leading-relaxed text-faint">Approved rules v{c.version}: YES if {c.yesCondition}</p>}
            </CardBody>
          </Card>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card>
              <CardHeader title="Evidence attached to this challenge" description={`${d.evidence.length} record(s)`} />
              <EvidenceList items={d.evidence} marketId={d.marketId} />
            </Card>
            <Card>
              <CardHeader title="Existing market evidence" description="Compare against what the recommendation relied on." />
              <EvidenceList items={d.market.evidence} marketId={d.marketId} cited={d.recommendation?.citedEvidenceIds ?? []} />
            </Card>
          </div>

          <Card>
            <CardHeader title="Review thread" />
            <ol className="divide-y divide-line">
              {d.comments.length === 0 && <li className="px-5 py-4 text-[13px] text-muted">No comments yet.</li>}
              {d.comments.map((cm) => (
                <li key={cm.id} className={cn("px-5 py-3.5", cm.kind === "DECISION" && "bg-emerald-wash/30", cm.kind === "EVIDENCE_REQUEST" && "bg-amber-wash/40")}>
                  <p className="text-[12.5px] text-faint">
                    <span className="text-muted">{cm.author.name}</span>, {cm.author.role.replace("_", " ").toLowerCase()}, {formatDateTime(cm.createdAt)}
                    {cm.kind !== "COMMENT" && <span className="ml-2 text-amber">{cm.kind === "EVIDENCE_REQUEST" ? "Evidence requested" : cm.kind === "DECISION" ? "Decision" : "Status change"}</span>}
                  </p>
                  <p className="mt-1 whitespace-pre-line text-[13.5px] leading-relaxed text-fg">{cm.body}</p>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Review" description={d.reviewer ? `Reviewer: ${d.reviewer.name}` : "No reviewer assigned"} />
            <CardBody>
              {d.decision && <Notice tone={d.status === "RESOLVED" ? "emerald" : "neutral"} title={d.status === "RESOLVED" ? "Challenge upheld" : "Challenge rejected"} className="mb-4">{d.decision}</Notice>}
              {role ? <DisputeActions disputeId={d.id} status={d.status} open={open} {...role} /> : <Notice tone="steel">Sign in to take part in this review.</Notice>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Audit trail" description="Every action on this dispute, in order." />
            <ol className="px-5 py-3">
              <li className="relative border-l border-line py-2 pl-4 text-[12.5px]"><span className="absolute top-3.5 -left-[3.5px] size-1.5 rounded-full bg-line-strong" /><span className="text-fg">created</span> <span className="text-faint">{formatDateTime(d.createdAt)}</span></li>
              {audit.map((a) => (
                <li key={a.id} className="relative border-l border-line py-2 pl-4 text-[12.5px]">
                  <span className="absolute top-3.5 -left-[3.5px] size-1.5 rounded-full bg-line-strong" />
                  <span className="text-fg">{a.action.replace("dispute.", "").replace("_", " ")}</span> <span className="text-muted">by {a.actor?.name ?? "system"}</span>
                  <span className="block text-faint">{formatDateTime(a.createdAt)}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}

function EvidenceList({ items, marketId, cited = [] }: { items: { id: string; title: string; status: string; analyses: { stance: string }[] }[]; marketId: string; cited?: string[] }) {
  return (
    <ul className="divide-y divide-line">
      {items.length === 0 && <li className="px-5 py-3 text-[13px] text-faint">None</li>}
      {items.map((e) => (
        <li key={e.id} className="px-5 py-3">
          <Link href={`/evidence/${marketId}#ev-${e.id}`} className="line-clamp-2 text-[13px] text-fg hover:text-emerald-soft">{e.title}</Link>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <EvidenceStatusBadge status={e.status as never} />
            <StanceBadge stance={e.analyses[0]?.stance} />
            {cited.includes(e.id) && <span className="text-[11.5px] text-emerald-soft">Cited by recommendation</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}
