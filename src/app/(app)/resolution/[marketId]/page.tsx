import Link from "next/link";
import { notFound } from "next/navigation";
import { Scale } from "lucide-react";
import { getMarketDetail, latestApproved } from "@/lib/services/markets";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { tally, type Category } from "@/lib/ai/resolution-rules";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { ConfidenceBar } from "@/components/domain/score-dial";
import { DemoBadge, EngineBadge, EvidenceStatusBadge, RecommendationBadge, StanceBadge } from "@/components/domain/badges";
import { ActionButton } from "@/components/domain/action-button";
import { LockCard } from "@/components/domain/lock-card";
import { formatDateTime, relativeTime } from "@/lib/utils";

export const metadata = { title: "Resolve" };

export default async function ResolutionPage({ params }: { params: Promise<{ marketId: string }> }) {
  const { marketId } = await params;
  const [m, user] = await Promise.all([getMarketDetail(marketId), getCurrentUser()]);
  if (!m) notFound();
  const criteria = latestApproved(m.criteria);
  const deadline = criteria?.resolutionDeadline ?? m.resolutionDeadline;
  const passed = deadline ? deadline.getTime() <= Date.now() : false;
  const rec = m.recommendations[0];
  const byId = new Map(m.evidence.map((e) => [e.id, e]));

  const groups = {
    yes: m.evidence.filter((e) => e.analyses[0]?.sourceAccessible && e.analyses[0]?.stance === "SUPPORTS_YES"),
    no: m.evidence.filter((e) => e.analyses[0]?.sourceAccessible && e.analyses[0]?.stance === "SUPPORTS_NO"),
    other: m.evidence.filter((e) => e.analyses[0]?.sourceAccessible && !["SUPPORTS_YES", "SUPPORTS_NO"].includes(e.analyses[0]?.stance ?? "")),
    unverified: m.evidence.filter((e) => !e.analyses[0]?.sourceAccessible),
  };
  const t = tally(m.evidence.map((e) => ({ id: e.id, title: e.title, category: e.category as Category, accessible: e.analyses[0]?.sourceAccessible ?? false, stance: e.analyses[0]?.stance ?? null, relevance: e.analyses[0]?.relevance ?? 0, status: e.status })));
  const openDispute = m.disputes.some((d) => ["SUBMITTED", "UNDER_REVIEW", "EVIDENCE_REQUESTED"].includes(d.status));

  return (
    <>
      <PageHeader
        title="Resolve"
        description={<Link href={`/markets/${m.id}`} className="hover:text-fg">{m.question}</Link>}
        meta={m.isDemo ? <DemoBadge /> : undefined}
        actions={
          <>
            {user && rec && !["RESOLVED", "CANCELLED", "DRAFT"].includes(m.status) && <ButtonLink href={`/disputes/new?market=${m.id}`}>Challenge</ButtonLink>}
            {can(user?.role, "resolution:generate") && criteria && <ActionButton endpoint={`/api/markets/${m.id}/recommendations`} label="Generate recommendation" success="Recommendation generated" variant="primary" size="md" />}
          </>
        }
      />
      <Notice tone="steel" className="mb-5">
        Recommendations are advisory and traceable to stored evidence. They never settle a market or move funds; the designated resolution mechanism remains responsible for settlement.
      </Notice>
      {!criteria && <Notice tone="amber" className="mb-5">This market has no approved rules, so no recommendation can be generated. <Link className="underline" href={`/markets/${m.id}`}>Review the rules</Link>.</Notice>}

      <LockCard
        marketId={m.id}
        approvedVersion={criteria?.version ?? null}
        criteriaHash={m.criteriaHash}
        anchorSignature={m.anchorSignature}
        predictMarketPda={m.predictMarketPda}
        isDemo={m.isDemo}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          {criteria && (
            <Card>
              <CardHeader title={`Locked rules, v${criteria.version}`} description="The outcome must follow these conditions. Evidence below is weighed against them, nothing else." />
              <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-[var(--radius-control)] border border-emerald/25 bg-emerald-wash/40 p-3.5">
                  <p className="text-[12.5px] font-medium text-emerald-soft">YES if</p>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-fg">{criteria.yesCondition}</p>
                </div>
                <div className="rounded-[var(--radius-control)] border border-rust/25 bg-rust-wash/40 p-3.5">
                  <p className="text-[12.5px] font-medium text-rust">NO if</p>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-fg">{criteria.noCondition}</p>
                </div>
                <p className="text-[12.5px] text-faint md:col-span-2">Source: {criteria.dataSource || "not defined"}. Deadline: {formatDateTime(criteria.resolutionDeadline)}.</p>
              </CardBody>
            </Card>
          )}
          {rec ? (
            <Card>
              <CardHeader
                title="Current recommendation"
                description={`Generated ${relativeTime(rec.createdAt)}${rec.requestedBy ? ` by ${rec.requestedBy.name}` : ""}, against rules v${m.criteria.find((c) => c.id === rec.criteriaId)?.version ?? "?"}`}
                action={<EngineBadge engine={rec.engine} model={rec.model} />}
              />
              <CardBody className="space-y-5">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="scale-125 origin-left"><RecommendationBadge value={rec.recommendation} /></span>
                  <div className="w-56"><p className="mb-1 text-[12px] text-faint">Confidence</p><ConfidenceBar value={rec.confidence} /></div>
                </div>
                <div>
                  <h3 className="text-[13px] font-semibold text-fg">Reasoning</h3>
                  <p className="mt-1.5 whitespace-pre-line text-[13.5px] leading-relaxed text-muted">{rec.reasoning}</p>
                </div>
                <div>
                  <h3 className="text-[13px] font-semibold text-fg">Uncertainty</h3>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{rec.uncertainty}</p>
                </div>
                <div>
                  <h3 className="text-[13px] font-semibold text-fg">Cited evidence ({rec.citedEvidenceIds.length})</h3>
                  {rec.citedEvidenceIds.length === 0 ? <p className="mt-1.5 text-[13px] text-muted">No records cited.</p> : (
                    <ul className="mt-2 space-y-1.5">
                      {rec.citedEvidenceIds.map((id) => {
                        const e = byId.get(id);
                        return (
                          <li key={id} className="flex flex-wrap items-center gap-2 text-[13px]">
                            {e ? <Link href={`/evidence/${m.id}#ev-${id}`} className="text-fg hover:text-emerald-soft">{e.title}</Link> : <span className="text-rust">Record {id} (no longer exists)</span>}
                            {e && <StanceBadge stance={e.analyses[0]?.stance} />}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {rec.rejectedCitations.length > 0 && <Notice tone="amber" className="mt-3">{rec.rejectedCitations.length} citation(s) from the model did not match any stored evidence record and were discarded: {rec.rejectedCitations.join(", ")}</Notice>}
                </div>
                {can(user?.role, "market:propose_resolution") && !m.isDemo && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
                    {passed && !openDispute && !["RESOLVED", "CANCELLED"].includes(m.status) ? (
                      <>
                        <span className="text-[13px] text-muted">Propose an outcome for review:</span>
                        <ActionButton endpoint={`/api/markets/${m.id}/propose`} body={{ outcome: "YES", recommendationId: rec.id }} label="Propose YES" success="Resolution proposed" confirmText="Propose YES? This opens the challenge window; it does not settle on-chain." />
                        <ActionButton endpoint={`/api/markets/${m.id}/propose`} body={{ outcome: "NO", recommendationId: rec.id }} label="Propose NO" success="Resolution proposed" confirmText="Propose NO? This opens the challenge window; it does not settle on-chain." />
                      </>
                    ) : (
                      <span className="text-[13px] text-faint">{openDispute ? "Proposals are locked while a dispute is open." : !passed ? "An outcome can be proposed after the deadline passes." : "This market is closed."}</span>
                    )}
                  </div>
                )}
              </CardBody>
            </Card>
          ) : (
            <EmptyState icon={<Scale />} title="No recommendation yet" body={criteria ? "Generate one to evaluate the stored evidence against the approved rules." : "Approve the market's rules first."} />
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <EvidenceColumn title="Supporting YES" tone="text-emerald-soft" items={groups.yes} marketId={m.id} />
            <EvidenceColumn title="Supporting NO" tone="text-rust" items={groups.no} marketId={m.id} />
            <EvidenceColumn title="Neutral or unclassified" tone="text-muted" items={groups.other} marketId={m.id} />
            <EvidenceColumn title="Unverified (excluded)" tone="text-faint" items={groups.unverified} marketId={m.id} />
          </div>

          {m.recommendations.length > 1 && (
            <Card>
              <CardHeader title="Recommendation history" />
              <ul className="divide-y divide-line">
                {m.recommendations.slice(1).map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-[13px]">
                    <RecommendationBadge value={r.recommendation} />
                    <EngineBadge engine={r.engine} model={r.model} />
                    <span className="text-muted">{Math.round(r.confidence * 100)}% confidence, {r.citedEvidenceIds.length} citations</span>
                    <span className="ml-auto text-faint">{formatDateTime(r.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Approved criteria" description={criteria ? `Version ${criteria.version}` : "None"} />
            {criteria && (
              <CardBody className="space-y-3 text-[13px] leading-relaxed">
                <p className="text-fg">{criteria.improvedQuestion}</p>
                <p><span className="text-emerald-soft">YES</span> <span className="text-muted">{criteria.yesCondition}</span></p>
                <p><span className="text-rust">NO</span> <span className="text-muted">{criteria.noCondition}</span></p>
                <p className="text-faint">Deadline {formatDateTime(criteria.resolutionDeadline)} ({passed ? "passed" : "not yet passed"}). Source: {criteria.dataSource}.</p>
              </CardBody>
            )}
          </Card>
          <Card>
            <CardHeader title="Evidence quality" description="Category reliability × analysed relevance." />
            <CardBody className="space-y-3 text-[13px]">
              <div><p className="mb-1 text-faint">Overall quality</p><ConfidenceBar value={t.quality} /></div>
              <div className="flex justify-between"><span className="text-muted">YES weight</span><span className="text-fg">{t.yesWeight.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted">NO weight</span><span className="text-fg">{t.noWeight.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted">Excluded, inaccessible</span><span className="text-fg">{t.inaccessibleIds.length}</span></div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Missing information" />
            <CardBody>
              {rec && (rec.missingInformation as string[]).length ? (
                <ul className="list-disc space-y-1.5 pl-4 text-[13px] leading-relaxed text-muted marker:text-faint">
                  {(rec.missingInformation as string[]).map((x) => <li key={x}>{x}</li>)}
                </ul>
              ) : <p className="text-[13px] text-muted">{rec ? "Nothing flagged." : "Generate a recommendation to see gaps."}</p>}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

function EvidenceColumn({ title, tone, items, marketId }: { title: string; tone: string; items: { id: string; title: string; status: string; sourceName: string }[]; marketId: string }) {
  return (
    <Card>
      <CardHeader title={<span className={tone}>{title}</span>} description={`${items.length} record${items.length === 1 ? "" : "s"}`} />
      <ul className="divide-y divide-line">
        {items.length === 0 && <li className="px-5 py-3 text-[13px] text-faint">None</li>}
        {items.map((e) => (
          <li key={e.id} className="px-5 py-3">
            <Link href={`/evidence/${marketId}#ev-${e.id}`} className="line-clamp-2 text-[13px] text-fg hover:text-emerald-soft">{e.title}</Link>
            <div className="mt-1.5 flex items-center gap-2"><EvidenceStatusBadge status={e.status as never} /><span className="truncate text-[12px] text-faint">{e.sourceName}</span></div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
