import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { evaluateIntegrity, type IntegrityStatus, type IntegrityFinding } from "@/lib/integrity/rules";

export const marketSummaryInclude = {
  criteria: { orderBy: { version: "desc" }, take: 1 },
  evidence: { select: { id: true, status: true } },
  disputes: { select: { id: true, status: true } },
  recommendations: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, recommendation: true, confidence: true, engine: true, createdAt: true } },
  creator: { select: { id: true, name: true } },
} satisfies Prisma.MarketInclude;

export type MarketWithSummary = Prisma.MarketGetPayload<{ include: typeof marketSummaryInclude }>;

const OPEN_DISPUTE = new Set(["SUBMITTED", "UNDER_REVIEW", "EVIDENCE_REQUESTED"]);

export function latestApproved<T extends { approved: boolean }>(list: T[]) {
  return list.find((c) => c.approved) ?? null;
}

export function integrityOf(m: MarketWithSummary, extra: { predictEndTs?: Date | null; approvedCriteria?: MarketWithSummary["criteria"][number] | null } = {}) {
  const c = extra.approvedCriteria ?? m.criteria[0] ?? null;
  return evaluateIntegrity({
    status: m.status,
    question: m.question,
    resolutionDeadline: m.resolutionDeadline,
    criteria: c
      ? {
          approved: c.approved,
          clarityScore: c.clarityScore,
          dataSource: c.dataSource,
          resolutionDeadline: c.resolutionDeadline,
          issues: (c.issues as { severity: string; code: string }[]) ?? [],
        }
      : null,
    evidence: m.evidence,
    openDisputes: m.disputes.filter((d) => OPEN_DISPUTE.has(d.status)).length,
    hasRecommendation: m.recommendations.length > 0,
    predictEndTs: extra.predictEndTs ?? null,
  });
}

export type MarketRow = MarketWithSummary & { integrity: { status: IntegrityStatus; findings: IntegrityFinding[] } };

export async function listMarkets(filters: {
  q?: string;
  category?: string;
  status?: "DRAFT" | "ACTIVE" | "AWAITING_RESOLUTION" | "RESOLUTION_PROPOSED" | "DISPUTED" | "RESOLVED" | "CANCELLED";
  integrity?: IntegrityStatus;
  resolves?: "7d" | "30d" | "90d" | "past";
  demo?: "include" | "exclude" | "only";
} = {}): Promise<MarketRow[]> {
  const where: Prisma.MarketWhereInput = {};
  if (filters.q) where.question = { contains: filters.q, mode: "insensitive" };
  if (filters.category) where.category = filters.category;
  if (filters.status) where.status = filters.status;
  if (filters.demo === "exclude") where.isDemo = false;
  if (filters.demo === "only") where.isDemo = true;
  if (filters.resolves) {
    const now = new Date();
    if (filters.resolves === "past") where.resolutionDeadline = { lt: now };
    else {
      const days = { "7d": 7, "30d": 30, "90d": 90 }[filters.resolves];
      where.resolutionDeadline = { gte: now, lte: new Date(now.getTime() + days * 86400e3) };
    }
  }
  const rows = await db.market.findMany({ where, include: marketSummaryInclude, orderBy: [{ resolutionDeadline: "asc" }, { createdAt: "desc" }], take: 200 });
  const withIntegrity = rows.map((m) => ({ ...m, integrity: integrityOf(m) }));
  return filters.integrity ? withIntegrity.filter((m) => m.integrity.status === filters.integrity) : withIntegrity;
}

export async function getMarketDetail(id: string) {
  return db.market.findUnique({
    where: { id },
    include: {
      creator: { select: { id: true, name: true } },
      criteria: { orderBy: { version: "desc" }, include: { approvedBy: { select: { name: true } } } },
      evidence: {
        orderBy: { createdAt: "desc" },
        include: {
          analyses: { orderBy: { createdAt: "desc" }, take: 1 },
          submittedBy: { select: { id: true, name: true } },
          // File metadata only — never the bytes or the full extracted text.
          file: { select: { fileName: true, sizeBytes: true, pageCount: true, extractionStatus: true, extractionError: true, extractedChars: true } },
        },
      },
      recommendations: { orderBy: { createdAt: "desc" }, include: { requestedBy: { select: { name: true } } } },
      disputes: { orderBy: { createdAt: "desc" }, include: { challenger: { select: { name: true } } } },
      activities: { orderBy: { createdAt: "desc" }, take: 40, include: { actor: { select: { name: true } } } },
      transactions: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
}
export type MarketDetail = NonNullable<Awaited<ReturnType<typeof getMarketDetail>>>;

export function detailIntegrity(m: MarketDetail, predictEndTs?: Date | null) {
  const approved = latestApproved(m.criteria);
  return evaluateIntegrity({
    status: m.status,
    question: m.question,
    resolutionDeadline: m.resolutionDeadline,
    criteria: approved
      ? { approved: true, clarityScore: approved.clarityScore, dataSource: approved.dataSource, resolutionDeadline: approved.resolutionDeadline, issues: approved.issues as { severity: string; code: string }[] }
      : m.criteria[0]
        ? { approved: false, clarityScore: m.criteria[0].clarityScore, dataSource: m.criteria[0].dataSource, resolutionDeadline: m.criteria[0].resolutionDeadline, issues: m.criteria[0].issues as { severity: string; code: string }[] }
        : null,
    evidence: m.evidence,
    openDisputes: m.disputes.filter((d) => OPEN_DISPUTE.has(d.status)).length,
    hasRecommendation: m.recommendations.length > 0,
    predictEndTs: predictEndTs ?? null,
  });
}

export async function marketOptions() {
  return db.market.findMany({ select: { id: true, question: true, isDemo: true, status: true }, orderBy: { updatedAt: "desc" }, take: 100 });
}
