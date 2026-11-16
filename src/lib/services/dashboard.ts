import "server-only";
import { db } from "@/lib/db";
import { listMarkets } from "./markets";
import { recLabel } from "@/lib/utils";

export type FeedItem = {
  id: string;
  kind: "ambiguity" | "evidence" | "contradiction" | "deadline" | "recommendation" | "dispute";
  title: string;
  detail: string;
  marketId: string;
  at: string;
  isDemo: boolean;
};

export async function getDashboard() {
  const markets = await listMarkets();
  const now = Date.now();
  const [evidenceCount, recent, recentRecs, openDisputes, evidenceByDay, contradicted] = await Promise.all([
    db.evidence.count(),
    db.marketActivity.findMany({ orderBy: { createdAt: "desc" }, take: 12, include: { actor: { select: { name: true } }, market: { select: { question: true } } } }),
    db.resolutionRecommendation.findMany({ orderBy: { createdAt: "desc" }, take: 6, include: { market: { select: { question: true, status: true, isDemo: true } } } }),
    db.dispute.findMany({ where: { status: { in: ["SUBMITTED", "UNDER_REVIEW", "EVIDENCE_REQUESTED"] } }, include: { market: { select: { question: true, isDemo: true } } }, orderBy: { createdAt: "desc" } }),
    db.$queryRaw<{ day: Date; count: bigint }[]>`SELECT date_trunc('day', "createdAt") AS day, count(*)::bigint AS count FROM "Evidence" WHERE "createdAt" > now() - interval '30 days' GROUP BY 1 ORDER BY 1`,
    db.evidence.findMany({ where: { status: "CONTRADICTED" }, orderBy: { updatedAt: "desc" }, take: 5, include: { market: { select: { question: true } } } }),
  ]);

  const awaiting = markets.filter((m) => ["AWAITING_RESOLUTION", "RESOLUTION_PROPOSED"].includes(m.status) || (m.resolutionDeadline && m.resolutionDeadline.getTime() < now && !["RESOLVED", "CANCELLED"].includes(m.status)));
  const flagged = markets.filter((m) => m.criteria[0] && (m.criteria[0].issues as { severity: string }[]).some((i) => i.severity !== "minor") && m.criteria[0].clarityScore < 70);

  const integrityCounts = { HEALTHY: 0, NEEDS_ATTENTION: 0, HIGH_RISK: 0, UNDER_DISPUTE: 0 };
  for (const m of markets) integrityCounts[m.integrity.status]++;

  const clarity = markets.filter((m) => m.criteria[0]).map((m) => m.criteria[0].clarityScore);
  const avgClarity = clarity.length ? Math.round(clarity.reduce((a, b) => a + b, 0) / clarity.length) : null;

  const feed: FeedItem[] = [];
  for (const m of flagged.slice(0, 4))
    feed.push({
      id: `amb-${m.id}`,
      kind: "ambiguity",
      title: "Ambiguity flagged",
      detail: `${(m.criteria[0].issues as unknown[]).length} issue(s), clarity ${m.criteria[0].clarityScore}/100. ${m.question}`,
      marketId: m.id,
      at: m.criteria[0].createdAt.toISOString(),
      isDemo: m.isDemo,
    });
  for (const e of contradicted)
    feed.push({ id: `con-${e.id}`, kind: "contradiction", title: "Contradictory evidence", detail: `${e.title}. Market: ${e.market.question}`, marketId: e.marketId, at: e.updatedAt.toISOString(), isDemo: e.isDemo });
  for (const m of markets.filter((x) => x.resolutionDeadline && x.resolutionDeadline.getTime() > now && x.resolutionDeadline.getTime() - now < 14 * 86400e3).slice(0, 3))
    feed.push({ id: `dl-${m.id}`, kind: "deadline", title: "Approaching resolution", detail: m.question, marketId: m.id, at: m.resolutionDeadline!.toISOString(), isDemo: m.isDemo });
  for (const r of recentRecs.filter((r) => r.market.status !== "RESOLVED").slice(0, 3))
    feed.push({ id: `rec-${r.id}`, kind: "recommendation", title: "Recommendation awaiting review", detail: `${recLabel(r.recommendation)}. ${r.market.question}`, marketId: r.marketId, at: r.createdAt.toISOString(), isDemo: r.market.isDemo });
  for (const d of openDisputes.slice(0, 3))
    feed.push({ id: `dis-${d.id}`, kind: "dispute", title: `Dispute ${d.status.replace(/_/g, " ").toLowerCase()}`, detail: d.market.question, marketId: d.marketId, at: d.createdAt.toISOString(), isDemo: d.market.isDemo });
  for (const a of recent.filter((a) => a.type === "evidence.submitted").slice(0, 3))
    feed.push({ id: `ev-${a.id}`, kind: "evidence", title: "New evidence", detail: `${a.message}. Market: ${a.market.question}`, marketId: a.marketId, at: a.createdAt.toISOString(), isDemo: a.isDemo });
  feed.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  return {
    totals: {
      markets: markets.length,
      demoMarkets: markets.filter((m) => m.isDemo).length,
      awaiting: awaiting.length,
      flagged: flagged.length,
      evidence: evidenceCount,
      disputes: openDisputes.length,
      avgClarity,
    },
    integrityCounts,
    evidenceByDay: evidenceByDay.map((r) => ({ day: r.day.toISOString().slice(0, 10), count: Number(r.count) })),
    feed: feed.slice(0, 12),
    recentMarkets: markets
      .filter((m) => m.recommendations[0] || m.criteria[0])
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, 6)
      .map((m) => ({ id: m.id, question: m.question, isDemo: m.isDemo, integrity: m.integrity.status, clarity: m.criteria[0]?.clarityScore ?? null, recommendation: m.recommendations[0]?.recommendation ?? null })),
    activity: recent.map((a) => ({ id: a.id, message: a.message, type: a.type, actor: a.actor?.name ?? "System", market: a.market.question, marketId: a.marketId, at: a.createdAt.toISOString(), isDemo: a.isDemo })),
  };
}
export type DashboardData = Awaited<ReturnType<typeof getDashboard>>;
