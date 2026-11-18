import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { getMarketDetail, detailIntegrity, latestApproved } from "@/lib/services/markets";
import { getCurrentUser } from "@/lib/auth/session";
import { canApproveCriteria } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Notice, PageHeader } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { DemoBadge, EngineBadge, EvidenceStatusBadge, IntegrityBadge, MarketStatusBadge, RecommendationBadge } from "@/components/domain/badges";
import { ActionButton } from "@/components/domain/action-button";
import { OnchainPanel } from "@/components/predict/onchain-panel";
import { formatDateTime, relativeTime } from "@/lib/utils";
import { DEMO_NOTICE } from "@/lib/demo/data";

export default async function MarketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [m, user] = await Promise.all([getMarketDetail(id), getCurrentUser()]);
  if (!m) notFound();
  const integrity = detailIntegrity(m);
  const approved = latestApproved(m.criteria);
  const latest = m.criteria[0];
  const wallets = user ? (await db.wallet.findMany({ where: { userId: user.id }, select: { address: true } })).map((w) => w.address) : [];
  const canApprove = user ? canApproveCriteria(user, m) && !m.isDemo : false;
  const counts = m.evidence.reduce<Record<string, number>>((a, e) => ((a[e.status] = (a[e.status] ?? 0) + 1), a), {});
  const rec = m.recommendations[0];

  return (
    <>
      <PageHeader
        title={m.question}
        meta={
          <>
            <MarketStatusBadge status={m.status} />
            <IntegrityBadge status={integrity.status} />
            {m.isDemo && <DemoBadge />}
            <span className="text-[12.5px] text-faint">{m.category}, resolves {formatDateTime(m.resolutionDeadline)}</span>
          </>
        }
        actions={
          <>
            <ButtonLink href={`/evidence/${m.id}`}>Evidence vault</ButtonLink>
            <ButtonLink href={`/resolution/${m.id}`} variant="primary">Resolve</ButtonLink>
          </>
        }
      />
      {m.isDemo && <Notice tone="amber" className="mb-5">{DEMO_NOTICE} Rules, statuses and recommendations on this page were computed by Lockline&apos;s engines from the sample records.</Notice>}
      {m.proposedOutcome && <Notice tone="steel" className="mb-5">Proposed outcome inside Lockline: <strong>{m.proposedOutcome}</strong>. This is not on-chain settlement; the market&apos;s designated resolution mechanism settles.</Notice>}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Card>
            <CardHeader
              title={approved ? `Approved resolution rules, v${approved.version}` : "Resolution rules (not approved)"}
              description={approved ? `Approved ${formatDateTime(approved.approvedAt)}${approved.approvedBy ? ` by ${approved.approvedBy.name}` : ""}` : "Traders should not rely on these rules until they are approved."}
              action={latest && !latest.approved && canApprove ? <ActionButton endpoint={`/api/markets/${m.id}/criteria/${latest.id}/approve`} label={`Approve v${latest.version}`} success="Rules approved" variant="primary" /> : undefined}
            />
            {(approved ?? latest) && (() => {
              const c = approved ?? latest!;
              return (
                <CardBody className="space-y-5">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="rounded-[var(--radius-control)] border border-emerald/25 bg-emerald-wash/40 p-3.5">
                      <p className="text-[12.5px] font-medium text-emerald-soft">Resolves YES if</p>
                      <p className="mt-1.5 text-[13.5px] leading-relaxed text-fg">{c.yesCondition}</p>
                    </div>
                    <div className="rounded-[var(--radius-control)] border border-rust/25 bg-rust-wash/40 p-3.5">
                      <p className="text-[12.5px] font-medium text-rust">Resolves NO if</p>
                      <p className="mt-1.5 text-[13.5px] leading-relaxed text-fg">{c.noCondition}</p>
                    </div>
                  </div>
                  <dl className="grid gap-4 text-[13px] sm:grid-cols-3">
                    <div><dt className="text-faint">Deadline</dt><dd className="mt-1 text-fg">{formatDateTime(c.resolutionDeadline)}</dd></div>
                    <div className="sm:col-span-2"><dt className="text-faint">Authoritative source</dt><dd className="mt-1 text-fg">{c.dataSourceUrl ? <a className="hover:text-emerald" href={c.dataSourceUrl} target="_blank" rel="noreferrer">{c.dataSource}</a> : c.dataSource || <span className="text-rust">Not defined</span>}</dd></div>
                  </dl>
                  <div>
                    <p className="text-[13px] text-faint">Methodology</p>
                    <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-muted">{c.methodology}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4 text-[12.5px] text-faint">
                    <EngineBadge engine={c.engine} model={c.model} />
                    <span>Original question: “{c.originalQuestion}”, clarity {c.clarityScore}/100.</span>
                  </div>
                </CardBody>
              );
            })()}
            {m.criteria.length > 1 && (
              <div className="border-t border-line px-5 py-3 text-[12.5px] text-muted">
                Version history: {m.criteria.map((c) => `v${c.version}${c.approved ? " (approved)" : ""}`).join(", ")}
              </div>
            )}
          </Card>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Card>
              <CardHeader title="Evidence" action={<Link className="text-[12.5px] text-emerald hover:underline" href={`/evidence/${m.id}`}>Open vault</Link>} />
              <CardBody className="space-y-2.5">
                {m.evidence.length === 0 ? <p className="text-[13px] text-muted">No evidence yet.</p> : Object.entries(counts).map(([s, n]) => (
                  <div key={s} className="flex items-center justify-between"><EvidenceStatusBadge status={s as never} /><span className="text-[13px] text-fg">{n}</span></div>
                ))}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Latest recommendation" action={<Link className="text-[12.5px] text-emerald hover:underline" href={`/resolution/${m.id}`}>Details</Link>} />
              <CardBody>
                {rec ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2"><RecommendationBadge value={rec.recommendation} /><EngineBadge engine={rec.engine} model={rec.model} /></div>
                    <p className="text-[13px] text-muted">Confidence {Math.round(rec.confidence * 100)}%, {rec.citedEvidenceIds.length} cited record(s), {relativeTime(rec.createdAt)}.</p>
                  </div>
                ) : <p className="text-[13px] text-muted">None generated yet.</p>}
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader title="Market timeline" />
            <ol className="px-5 py-3">
              {m.activities.map((a) => (
                <li key={a.id} className="relative border-l border-line py-2 pl-4">
                  <span className="absolute top-3.5 -left-[3.5px] size-1.5 rounded-full bg-line-strong" />
                  <p className="text-[13px] text-fg">{a.message}</p>
                  <p className="mt-0.5 text-[12px] text-faint">{a.actor?.name ?? "System"}, {formatDateTime(a.createdAt)}</p>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Integrity" description="Derived from named rules over stored data." />
            <CardBody>
              {integrity.findings.length === 0 ? (
                <p className="flex items-center gap-2 text-[13px] text-emerald-soft"><CheckCircle2 className="size-4" /> No rule is triggered.</p>
              ) : (
                <ul className="space-y-3">
                  {integrity.findings.map((f, i) => (
                    <li key={i} className="flex gap-2.5 text-[13px]">
                      <CircleAlert className={f.level === "high" ? "mt-0.5 size-4 shrink-0 text-rust" : "mt-0.5 size-4 shrink-0 text-amber"} />
                      <span><span className="font-medium text-fg">{f.rule}</span><span className="block text-muted">{f.message}</span></span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="On-chain" description={`Solana ${process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? "devnet"} and PREDICT pm-AMM`} />
            <CardBody>
              <OnchainPanel
                marketId={m.id}
                isDemo={m.isDemo}
                isCreator={!!user && (user.id === m.creatorId || user.role === "ADMIN")}
                signedIn={!!user}
                approved={!!approved}
                improvedQuestion={approved?.improvedQuestion ?? m.question}
                deadline={(approved?.resolutionDeadline ?? m.resolutionDeadline)?.toISOString() ?? null}
                criteriaHash={m.criteriaHash}
                anchorSignature={m.anchorSignature}
                predictMarketPda={m.predictMarketPda}
                linkedWallets={wallets}
              />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
