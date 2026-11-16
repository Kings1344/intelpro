/**
 * Seeds an admin account and the clearly-labelled demonstration dataset.
 * Run: npm run db:seed   (idempotent: demo rows are deleted and recreated)
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { hashPassword } from "../src/lib/auth/password";
import { heuristicArchitect, ruleChecks, scoreFromIssues, validateCriteria } from "../src/lib/ai/heuristics";
import { deriveStatuses } from "../src/lib/evidence/status";
import { ruleRecommendation } from "../src/lib/ai/resolution-rules";
import { DEMO_MARKETS, type DemoEvidence } from "../src/lib/demo/data";
import { recLabel } from "../src/lib/utils";

const db = new PrismaClient();
const DAY = 86400e3;

async function main() {
  const now = new Date();

  // ── Admin (real account, from env) ────────────────────────────────────────
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "admin@intelpro.dev").toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "change-me-now-123";
  await db.user.upsert({
    where: { email: adminEmail },
    update: { role: "ADMIN" },
    // The bootstrap admin is created by the operator, so its address is treated as verified.
    create: { email: adminEmail, name: "IntelPro Admin", role: "ADMIN", emailVerifiedAt: new Date(), passwordHash: await hashPassword(adminPassword) },
  });

  // ── Reset demo data ───────────────────────────────────────────────────────
  await db.market.deleteMany({ where: { isDemo: true } });
  const demoUserIds = (await db.user.findMany({ where: { isDemo: true }, select: { id: true } })).map((u) => u.id);
  await db.disputeComment.deleteMany({ where: { authorId: { in: demoUserIds } } });
  await db.dispute.deleteMany({ where: { challengerId: { in: demoUserIds } } });
  await db.user.deleteMany({ where: { isDemo: true } });

  // Demo personas cannot sign in: their password hash is of a random secret that is discarded.
  const persona = async (email: string, name: string, role: "MARKET_CREATOR" | "REVIEWER" | "USER") =>
    db.user.create({ data: { email, name, role, isDemo: true, emailVerifiedAt: new Date(), passwordHash: await hashPassword(randomBytes(24).toString("hex")) } });
  const creator = await persona("ada.demo@example.com", "Ada (demo creator)", "MARKET_CREATOR");
  const reviewer = await persona("rui.demo@example.com", "Rui (demo reviewer)", "REVIEWER");
  const trader = await persona("sam.demo@example.com", "Sam (demo trader)", "USER");
  const who = { creator, reviewer, trader };

  for (const dm of DEMO_MARKETS) {
    const createdAt = new Date(now.getTime() - 20 * DAY);
    const deadline = dm.fixedDeadline ? new Date(dm.fixedDeadline) : dm.deadlineDaysFromNow !== null ? new Date(now.getTime() + dm.deadlineDaysFromNow * DAY) : null;

    const market = await db.market.create({
      data: {
        question: dm.approvedCriteria?.improvedQuestion ?? dm.question,
        description: dm.description,
        category: dm.category,
        status: dm.status,
        origin: "DEMO",
        isDemo: true,
        creatorId: creator.id,
        resolutionDeadline: deadline,
        createdAt,
      },
    });

    // v1: the real heuristic engine's analysis of the original wording.
    const v1 = heuristicArchitect(dm.question, createdAt);
    await db.marketCriteria.create({
      data: {
        marketId: market.id,
        version: 1,
        originalQuestion: dm.question,
        improvedQuestion: v1.improvedQuestion,
        yesCondition: v1.yesCondition,
        noCondition: v1.noCondition,
        resolutionDeadline: deadline ?? new Date(v1.resolutionDeadline),
        timezone: "UTC",
        dataSource: v1.dataSource || "",
        dataSourceUrl: v1.dataSourceUrl,
        methodology: v1.methodology,
        clarityScore: v1.clarityScore,
        issues: v1.issues as unknown as Prisma.InputJsonValue,
        engine: "HEURISTIC",
        createdAt,
      },
    });
    await db.marketActivity.create({ data: { marketId: market.id, actorId: creator.id, isDemo: true, type: "market.analysed", message: `Market Architect flagged ${v1.issues.length} issue(s); clarity ${v1.clarityScore}/100`, createdAt } });

    let criteriaId: string | null = null;
    if (dm.approvedCriteria && deadline) {
      const ac = dm.approvedCriteria;
      const checks = ruleChecks(ac.improvedQuestion, createdAt);
      const warnings = [...checks, ...validateCriteria({ ...ac, resolutionDeadline: deadline.toISOString() }, createdAt)];
      const approvedAt = new Date(createdAt.getTime() + DAY);
      const v2 = await db.marketCriteria.create({
        data: {
          marketId: market.id,
          version: 2,
          originalQuestion: dm.question,
          improvedQuestion: ac.improvedQuestion,
          yesCondition: ac.yesCondition,
          noCondition: ac.noCondition,
          resolutionDeadline: deadline,
          dataSource: ac.dataSource,
          dataSourceUrl: ac.dataSourceUrl,
          methodology: ac.methodology,
          clarityScore: scoreFromIssues(checks).score,
          issues: warnings as unknown as Prisma.InputJsonValue,
          engine: "HEURISTIC",
          approved: true,
          approvedAt,
          approvedById: creator.id,
          createdAt: approvedAt,
        },
      });
      criteriaId = v2.id;
      await db.marketActivity.create({ data: { marketId: market.id, actorId: creator.id, isDemo: true, type: "criteria.approved", message: "Resolution criteria v2 approved", createdAt: approvedAt } });
    }

    // Evidence
    const createEvidence = async (e: DemoEvidence, i: number, disputeId?: string) => {
      const at = new Date(now.getTime() - (e.publishedDaysAgo ?? 1) * DAY + i * 3600e3);
      const ev = await db.evidence.create({
        data: {
          marketId: market.id,
          submittedById: who[e.submitter].id,
          disputeId: disputeId ?? null,
          title: e.title,
          sourceName: e.sourceName,
          sourceUrl: e.sourceUrl,
          description: e.description,
          publishedAt: e.publishedDaysAgo !== null ? new Date(now.getTime() - e.publishedDaysAgo * DAY) : null,
          category: e.category,
          claimedStance: e.claimedStance,
          status: !e.accessible ? "UNABLE_TO_VERIFY" : e.analysis ? "ANALYSED" : "ACCESSIBLE",
          isDemo: true,
          httpStatus: e.accessible ? 200 : 404,
          fetchError: e.fetchError ?? null,
          fetchedAt: at,
          createdAt: at,
        },
      });
      if (!e.accessible) {
        await db.evidenceAnalysis.create({
          data: { evidenceId: ev.id, engine: "HEURISTIC", sourceAccessible: false, summary: `Demonstration: source could not be retrieved (${e.fetchError}). Claims are unverified.`, stance: "UNCLASSIFIED", relevance: 0, claims: [], reasoning: "No content available.", createdAt: at },
        });
      } else if (e.analysis) {
        await db.evidenceAnalysis.create({
          data: {
            evidenceId: ev.id,
            engine: "HEURISTIC",
            sourceAccessible: true,
            excerpt: e.description,
            summary: e.analysis.summary,
            stance: e.analysis.stance,
            relevance: e.analysis.relevance,
            claims: e.analysis.claims as unknown as Prisma.InputJsonValue,
            reasoning: "Pre-written demonstration analysis. Re-analysis of demo records is disabled because their URLs are fictitious.",
            createdAt: at,
          },
        });
      }
      await db.marketActivity.create({ data: { marketId: market.id, actorId: who[e.submitter].id, isDemo: true, type: "evidence.submitted", message: `Evidence submitted: ${e.title}`, createdAt: at } });
      return ev;
    };
    for (const [i, e] of dm.evidence.entries()) await createEvidence(e, i);

    // Cross-evidence statuses via the real status engine.
    const rows = await db.evidence.findMany({ where: { marketId: market.id }, include: { analyses: { take: 1, orderBy: { createdAt: "desc" } } } });
    for (const c of deriveStatuses(rows.map((r) => ({ id: r.id, sourceUrl: r.sourceUrl ?? `pdf:${r.sourceName.toLowerCase()}`, status: r.status, analysedStance: r.analyses[0]?.stance ?? null }))))
      await db.evidence.update({ where: { id: c.id }, data: { status: c.status } });

    // Recommendation via the real rules engine.
    let recommendationId: string | null = null;
    if (dm.generateRecommendation && criteriaId && deadline) {
      const ev = await db.evidence.findMany({ where: { marketId: market.id, disputeId: null }, include: { analyses: { take: 1, orderBy: { createdAt: "desc" } } } });
      const rec = ruleRecommendation(
        ev.map((e) => ({ id: e.id, title: e.title, category: e.category, accessible: e.analyses[0]?.sourceAccessible ?? false, stance: e.analyses[0]?.stance ?? null, relevance: e.analyses[0]?.relevance ?? 0, status: e.status })),
        { deadlinePassed: deadline.getTime() <= now.getTime(), dataSource: dm.approvedCriteria!.dataSource },
      );
      const r = await db.resolutionRecommendation.create({
        data: { marketId: market.id, criteriaId, requestedById: reviewer.id, ...rec, missingInformation: rec.missingInformation, rejectedCitations: [], engine: "HEURISTIC", isDemo: true, createdAt: new Date(now.getTime() - DAY) },
      });
      recommendationId = r.id;
      await db.marketActivity.create({ data: { marketId: market.id, actorId: reviewer.id, isDemo: true, type: "resolution.recommended", message: `Recommendation generated: ${recLabel(rec.recommendation)}`, createdAt: r.createdAt } });
    }
    if (dm.proposeOutcome) {
      await db.market.update({ where: { id: market.id }, data: { proposedOutcome: dm.proposeOutcome } });
      await db.marketActivity.create({ data: { marketId: market.id, actorId: reviewer.id, isDemo: true, type: "resolution.proposed", message: `Resolution proposed: ${dm.proposeOutcome}` } });
    }

    if (dm.dispute) {
      const d = await db.dispute.create({
        data: { marketId: market.id, recommendationId, challengerId: trader.id, reviewerId: reviewer.id, reason: dm.dispute.reason, status: dm.dispute.status, isDemo: true, createdAt: new Date(now.getTime() - 0.8 * DAY) },
      });
      for (const [i, e] of dm.dispute.evidence.entries()) await createEvidence(e, i + 10, d.id);
      for (const [i, c] of dm.dispute.comments.entries())
        await db.disputeComment.create({ data: { disputeId: d.id, authorId: who[c.by].id, kind: c.kind, body: c.body, createdAt: new Date(now.getTime() - (0.7 - i * 0.1) * DAY) } });
      await db.marketActivity.create({ data: { marketId: market.id, actorId: trader.id, isDemo: true, type: "dispute.created", message: "Challenge submitted against the interim recommendation", createdAt: d.createdAt } });
    }

    await db.auditLog.create({ data: { actorId: creator.id, action: "seed.demo_market", entityType: "Market", entityId: market.id, metadata: { key: dm.key, isDemo: true } } });
  }

  console.log(`Seeded admin <${adminEmail}> and ${DEMO_MARKETS.length} demonstration markets.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
