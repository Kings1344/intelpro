import Link from "next/link";
import { AlertTriangle, Archive, CalendarClock, FileWarning, Gavel, Scale, Sparkles } from "lucide-react";
import { getDashboard, type FeedItem } from "@/lib/services/dashboard";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader, Stat } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { DemoBadge, IntegrityBadge, RecommendationBadge } from "@/components/domain/badges";
import { EvidenceVolumeChart, IntegrityDistribution } from "@/components/charts/charts";
import { relativeTime } from "@/lib/utils";
import { getCurrentUser } from "@/lib/auth/session";
import { Onboarding } from "@/components/domain/onboarding";

export const metadata = { title: "Overview" };

const FEED_ICON: Record<FeedItem["kind"], React.ReactNode> = {
  ambiguity: <FileWarning className="text-amber" />,
  evidence: <Archive className="text-muted" />,
  contradiction: <AlertTriangle className="text-amber" />,
  deadline: <CalendarClock className="text-steel" />,
  recommendation: <Scale className="text-emerald" />,
  dispute: <Gavel className="text-steel" />,
};

export default async function OverviewPage() {
  const [d, user] = await Promise.all([getDashboard(), getCurrentUser()]);
  const t = d.totals;

  if (t.markets === 0) {
    return (
      <>
        <PageHeader title="Overview" description="Market integrity across everything IntelPro monitors." />
        <EmptyState
          icon={<Sparkles />}
          title="No markets monitored yet"
          body="Start by analysing a market question in the Market Architect, or load the demonstration market with npm run db:seed."
          action={<ButtonLink href="/architect" variant="primary">Analyse a question</ButtonLink>}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Overview"
        description="Market integrity across everything IntelPro monitors."
        actions={<ButtonLink href="/architect" variant="primary">New market</ButtonLink>}
      />
      {user && <Onboarding userId={user.id} />}
      {t.demoMarkets > 0 && (
        <p className="-mt-3 mb-5 text-[12.5px] text-faint">
          Includes {t.demoMarkets} demonstration market{t.demoMarkets === 1 ? "" : "s"}, labelled <span className="text-amber">Demo data</span> wherever they appear.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Markets monitored" value={t.markets} href="/markets" />
        <Stat label="Awaiting resolution" value={t.awaiting} href="/resolution" tone={t.awaiting ? "steel" : undefined} />
        <Stat label="Flagged ambiguities" value={t.flagged} sub="Clarity below 70" href="/integrity" tone={t.flagged ? "amber" : undefined} />
        <Stat label="Evidence records" value={t.evidence} href="/evidence" />
        <Stat label="Active disputes" value={t.disputes} href="/disputes" tone={t.disputes ? "steel" : undefined} />
        <Stat label="Average clarity" value={t.avgClarity ?? "—"} sub="Latest criteria per market" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Card>
          <CardHeader title="IntelPro Intelligence Feed" description="Observations that need a human decision, newest first." />
          {d.feed.length === 0 ? (
            <CardBody>
              <p className="text-[13px] text-muted">Nothing needs attention. New ambiguities, contradictions, deadlines and disputes appear here.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-line">
              {d.feed.map((f) => (
                <li key={f.id}>
                  <Link href={f.kind === "dispute" ? "/disputes" : f.kind === "recommendation" ? `/resolution/${f.marketId}` : f.kind === "evidence" || f.kind === "contradiction" ? `/evidence/${f.marketId}` : `/markets/${f.marketId}`} className="flex gap-3.5 px-5 py-3.5 hover:bg-raised/50">
                    <span className="mt-0.5 [&_svg]:size-4">{FEED_ICON[f.kind]}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[13.5px] font-medium text-fg">{f.title}</span>
                        {f.isDemo && <DemoBadge />}
                      </span>
                      <span className="mt-0.5 block truncate text-[13px] text-muted">{f.detail}</span>
                    </span>
                    <span className="shrink-0 text-[12px] text-faint">{relativeTime(f.at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Market integrity" description="Rule-based status of every market." action={<Link href="/integrity" className="text-[12.5px] text-emerald hover:underline">Open monitor</Link>} />
            <CardBody>
              <IntegrityDistribution counts={d.integrityCounts} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Evidence collected" description="Records submitted per day, last 30 days." />
            <CardBody className="pt-2">
              <EvidenceVolumeChart data={d.evidenceByDay} />
            </CardBody>
          </Card>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Recently analysed markets" />
          <ul className="divide-y divide-line">
            {d.recentMarkets.map((m) => (
              <li key={m.id}>
                <Link href={`/markets/${m.id}`} className="block px-5 py-3.5 hover:bg-raised/50">
                  <p className="line-clamp-2 text-[13.5px] text-fg">{m.question}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <IntegrityBadge status={m.integrity} />
                    {m.clarity !== null && <span className="text-[12px] text-muted">Clarity {m.clarity}/100</span>}
                    {m.recommendation && <RecommendationBadge value={m.recommendation} />}
                    {m.isDemo && <DemoBadge />}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Recent platform activity" />
          {d.activity.length === 0 ? (
            <CardBody><p className="text-[13px] text-muted">No activity yet.</p></CardBody>
          ) : (
            <ol className="px-5 py-3">
              {d.activity.map((a) => (
                <li key={a.id} className="relative border-l border-line py-2 pl-4">
                  <span className="absolute top-3.5 -left-[3.5px] size-1.5 rounded-full bg-line-strong" />
                  <p className="text-[13px] text-fg">{a.message}</p>
                  <p className="mt-0.5 truncate text-[12px] text-faint">
                    {a.actor}, {relativeTime(a.at)}. <Link className="hover:text-muted" href={`/markets/${a.marketId}`}>{a.market}</Link>
                  </p>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </>
  );
}
