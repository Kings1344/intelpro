import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { fetchEvidenceSource } from "@/lib/evidence/fetch-source";
import { deriveStatuses } from "@/lib/evidence/status";
import { analyseEvidenceText } from "@/lib/ai/evidence-analysis";
import { activity, audit, notify } from "@/lib/server/audit";
import { latestApproved } from "./markets";

/**
 * Evidence-analysis pipeline:
 * 1 retrieve source → 2 accessibility check → 3 extract relevant text →
 * 4 compare with approved criteria → 5 grounded claims → 6 summary → 7 store,
 * then recompute cross-evidence statuses (corroborated / contradicted).
 */
export async function analyseEvidence(evidenceId: string, actorId: string | null) {
  const ev = await db.evidence.findUnique({
    where: { id: evidenceId },
    include: { market: { include: { criteria: { orderBy: { version: "desc" } } } }, file: { select: { extractedText: true, extractionStatus: true, extractionError: true, sha256: true } } },
  });
  if (!ev) throw new Error("Evidence not found");
  const criteria = latestApproved(ev.market.criteria) ?? ev.market.criteria[0];
  if (!criteria) throw new Error("This market has no resolution criteria to analyse evidence against.");

  if (ev.isDemo) {
    // Demonstration records use fictitious URLs; never pretend they were retrieved.
    return { analysis: null, status: ev.status, note: "Demonstration evidence is not re-fetched. Its stored analysis is labelled as demonstration data." };
  }

  // Uploaded PDFs use their stored text layer; URLs are retrieved live.
  const fetched: Awaited<ReturnType<typeof fetchEvidenceSource>> =
    ev.sourceKind === "PDF_UPLOAD"
      ? ev.file?.extractedText
        ? { ok: true, finalUrl: ev.sourceUrl ?? "", httpStatus: 200, contentType: "application/pdf", title: null, text: ev.file.extractedText, contentHash: ev.file.sha256 }
        : { ok: false, reason: ev.file?.extractionError ?? "The uploaded PDF has no readable text." }
      : ev.sourceUrl
        ? await fetchEvidenceSource(ev.sourceUrl)
        : { ok: false, reason: "This evidence has no source URL." };
  if (!fetched.ok) {
    const analysis = await db.$transaction(async (tx) => {
      await tx.evidence.update({ where: { id: ev.id }, data: { status: "UNABLE_TO_VERIFY", httpStatus: fetched.httpStatus ?? null, fetchError: fetched.reason, fetchedAt: new Date() } });
      // Note: an unreadable source never receives a stance; it carries zero weight in resolution.
      const a = await tx.evidenceAnalysis.create({
        data: {
          evidenceId: ev.id,
          engine: "HEURISTIC",
          sourceAccessible: false,
          summary: `${ev.sourceKind === "PDF_UPLOAD" ? "PDF text could not be read" : "Source could not be retrieved"}: ${fetched.reason} The submitter's claims are unverified and are excluded from resolution weighting.`,
          stance: "UNCLASSIFIED",
          relevance: 0,
          claims: [],
          reasoning: "No content was available to compare against the resolution criteria.",
        },
      });
      await activity(tx, { marketId: ev.marketId, actorId, type: "evidence.unverifiable", message: `Source unavailable for “${ev.title}”`, metadata: { reason: fetched.reason } });
      await audit(tx, { actorId, action: "evidence.analyse", entityType: "Evidence", entityId: ev.id, metadata: { accessible: false, reason: fetched.reason } });
      return a;
    });
    return { analysis, status: "UNABLE_TO_VERIFY" as const, note: fetched.reason };
  }

  const result = await analyseEvidenceText({
    criteria: {
      improvedQuestion: criteria.improvedQuestion,
      yesCondition: criteria.yesCondition,
      noCondition: criteria.noCondition,
      resolutionDeadline: criteria.resolutionDeadline.toISOString(),
      dataSource: criteria.dataSource,
    },
    evidence: { title: ev.title, sourceName: ev.sourceName, sourceUrl: ev.sourceUrl ?? `Uploaded PDF (sha256 ${ev.file?.sha256.slice(0, 16)}…)`, publishedAt: ev.publishedAt?.toISOString() ?? null, description: ev.description },
    sourceText: fetched.text,
  });

  const analysis = await db.$transaction(async (tx) => {
    await tx.evidence.update({
      where: { id: ev.id },
      data: { status: "ANALYSED", httpStatus: fetched.httpStatus, contentHash: fetched.contentHash, fetchedAt: new Date(), fetchError: null },
    });
    const a = await tx.evidenceAnalysis.create({
      data: {
        evidenceId: ev.id,
        engine: result.engine,
        model: result.model,
        sourceAccessible: true,
        excerpt: result.excerpt,
        summary: result.summary,
        stance: result.stance,
        relevance: result.relevance,
        claims: result.claims as unknown as Prisma.InputJsonValue,
        reasoning: result.aiError ? `${result.reasoning}\n\nAI unavailable: ${result.aiError}` : result.reasoning,
      },
    });
    await activity(tx, { marketId: ev.marketId, actorId, type: "evidence.analysed", message: `Evidence analysed (${result.engine === "AI" ? "AI" : "heuristic"}): “${ev.title}”`, metadata: { stance: result.stance } });
    await audit(tx, { actorId, action: "evidence.analyse", entityType: "Evidence", entityId: ev.id, metadata: { engine: result.engine, stance: result.stance, contentHash: fetched.contentHash } });
    return a;
  });

  await recomputeMarketEvidenceStatuses(ev.marketId, actorId);
  const fresh = await db.evidence.findUnique({ where: { id: ev.id }, select: { status: true } });
  return { analysis, status: fresh?.status ?? "ANALYSED", note: result.aiError };
}

export async function recomputeMarketEvidenceStatuses(marketId: string, actorId: string | null) {
  const items = await db.evidence.findMany({ where: { marketId }, include: { analyses: { orderBy: { createdAt: "desc" }, take: 1 } } });
  const changes = deriveStatuses(
    items.map((e) => ({ id: e.id, sourceUrl: e.sourceUrl ?? `pdf:${e.sourceName.toLowerCase()}`, status: e.status, analysedStance: e.analyses[0]?.stance ?? null })),
  );
  if (!changes.length) return;
  const market = await db.market.findUnique({ where: { id: marketId }, select: { creatorId: true, question: true } });
  await db.$transaction(async (tx) => {
    for (const c of changes) {
      await tx.evidence.update({ where: { id: c.id }, data: { status: c.status } });
      if (c.status === "CONTRADICTED") {
        await activity(tx, { marketId, actorId, type: "evidence.contradicted", message: "Contradictory evidence detected", metadata: { evidenceId: c.id } });
        if (market?.creatorId)
          await notify(tx, { userId: market.creatorId, type: "evidence.contradicted", title: "Contradictory evidence", body: market.question, link: `/evidence/${marketId}` });
      }
    }
  });
}
