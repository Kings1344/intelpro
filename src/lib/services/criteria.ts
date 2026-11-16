import "server-only";
import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, forbidden, notFound } from "@/lib/server/api";
import { blocksApproval, validateCriteria } from "@/lib/ai/heuristics";
import { canApproveCriteria } from "@/lib/auth/rbac";
import type { SessionUser } from "@/lib/auth/session";
import type { criteriaInput } from "@/lib/validation";
import { activity, audit } from "@/lib/server/audit";
import type { Issue } from "@/lib/ai/types";

type CriteriaInput = z.infer<typeof criteriaInput>;

/** Server-side re-validation: the client cannot bypass approval checks. */
export function approvalIssues(c: CriteriaInput, now = new Date()): Issue[] {
  return validateCriteria(
    { improvedQuestion: c.improvedQuestion, yesCondition: c.yesCondition, noCondition: c.noCondition, resolutionDeadline: c.resolutionDeadline, dataSource: c.dataSource, methodology: c.methodology },
    now,
  );
}

function assertApprovable(c: CriteriaInput) {
  const issues = approvalIssues(c);
  if (blocksApproval(issues)) throw new ApiError(422, "criteria_invalid", "These rules cannot be approved until critical issues are fixed.", issues);
  return issues;
}

export async function createMarketWithCriteria(user: SessionUser, input: { category: string; description?: string; criteria: CriteriaInput; approve: boolean }, ip: string | null) {
  const warnings = input.approve ? assertApprovable(input.criteria) : approvalIssues(input.criteria);
  const deadline = new Date(input.criteria.resolutionDeadline);
  return db.$transaction(async (tx) => {
    const market = await tx.market.create({
      data: {
        question: input.criteria.improvedQuestion,
        description: input.description,
        category: input.category,
        status: input.approve ? "ACTIVE" : "DRAFT",
        origin: "USER",
        creatorId: user.id,
        resolutionDeadline: deadline,
      },
    });
    await tx.marketCriteria.create({ data: criteriaData(market.id, 1, input.criteria, warnings, input.approve ? user.id : null) });
    await activity(tx, { marketId: market.id, actorId: user.id, type: "market.created", message: `Market created (${input.criteria.engine === "AI" ? "AI" : "heuristic"} analysis, clarity ${input.criteria.clarityScore}/100)` });
    if (input.approve) await activity(tx, { marketId: market.id, actorId: user.id, type: "criteria.approved", message: "Resolution criteria v1 approved" });
    await audit(tx, { actorId: user.id, action: "market.create", entityType: "Market", entityId: market.id, metadata: { approved: input.approve, engine: input.criteria.engine }, ip });
    return market;
  });
}

function criteriaData(marketId: string, version: number, c: CriteriaInput, warnings: Issue[], approverId: string | null): Prisma.MarketCriteriaUncheckedCreateInput {
  // Store the analysis issues of the original question plus the approval-time warnings.
  const codes = new Set(c.issues.map((i) => `${i.code}:${i.message}`));
  const merged = [...c.issues, ...warnings.filter((w) => !codes.has(`${w.code}:${w.message}`))];
  return {
    marketId,
    version,
    originalQuestion: c.originalQuestion,
    improvedQuestion: c.improvedQuestion,
    yesCondition: c.yesCondition,
    noCondition: c.noCondition,
    resolutionDeadline: new Date(c.resolutionDeadline),
    timezone: c.timezone,
    dataSource: c.dataSource,
    dataSourceUrl: c.dataSourceUrl ?? null,
    methodology: c.methodology,
    clarityScore: c.clarityScore,
    issues: merged as unknown as Prisma.InputJsonValue,
    engine: c.engine,
    model: c.model ?? null,
    approved: Boolean(approverId),
    approvedAt: approverId ? new Date() : null,
    approvedById: approverId,
  };
}

export async function addCriteriaVersion(user: SessionUser, marketId: string, c: CriteriaInput, approve: boolean, ip: string | null) {
  const market = await db.market.findUnique({ where: { id: marketId }, include: { criteria: { select: { version: true } } } });
  if (!market) throw notFound("Market");
  if (market.isDemo) throw forbidden("Demonstration markets are read-only. Create your own market in the Market Architect.");
  if (!canApproveCriteria(user, market)) throw forbidden("Only the market creator or an administrator can edit resolution rules.");
  if (["RESOLVED", "CANCELLED"].includes(market.status)) throw new ApiError(409, "conflict", "Resolved markets cannot change their rules.");
  const warnings = approve ? assertApprovable(c) : approvalIssues(c);
  const version = Math.max(0, ...market.criteria.map((x) => x.version)) + 1;
  return db.$transaction(async (tx) => {
    if (approve) await tx.marketCriteria.updateMany({ where: { marketId }, data: { approved: false } });
    const row = await tx.marketCriteria.create({ data: criteriaData(marketId, version, c, warnings, approve ? user.id : null) });
    if (approve) await applyApproval(tx, marketId, row.improvedQuestion, row.resolutionDeadline, market.status);
    await activity(tx, { marketId, actorId: user.id, type: approve ? "criteria.approved" : "criteria.revised", message: `Resolution criteria v${version} ${approve ? "approved" : "drafted"}` });
    await audit(tx, { actorId: user.id, action: approve ? "criteria.approve" : "criteria.revise", entityType: "MarketCriteria", entityId: row.id, metadata: { version }, ip });
    return row;
  });
}

export async function approveExistingCriteria(user: SessionUser, marketId: string, criteriaId: string, ip: string | null) {
  const market = await db.market.findUnique({ where: { id: marketId } });
  const c = await db.marketCriteria.findFirst({ where: { id: criteriaId, marketId } });
  if (!market || !c) throw notFound("Criteria");
  if (market.isDemo) throw forbidden("Demonstration markets are read-only.");
  if (!canApproveCriteria(user, market)) throw forbidden("Only the market creator or an administrator can approve resolution rules.");
  assertApprovable({ ...c, resolutionDeadline: c.resolutionDeadline.toISOString(), issues: [], engine: c.engine, dataSourceUrl: c.dataSourceUrl });
  return db.$transaction(async (tx) => {
    await tx.marketCriteria.updateMany({ where: { marketId }, data: { approved: false } });
    const row = await tx.marketCriteria.update({ where: { id: c.id }, data: { approved: true, approvedAt: new Date(), approvedById: user.id } });
    await applyApproval(tx, marketId, row.improvedQuestion, row.resolutionDeadline, market.status);
    await activity(tx, { marketId, actorId: user.id, type: "criteria.approved", message: `Resolution criteria v${row.version} approved` });
    await audit(tx, { actorId: user.id, action: "criteria.approve", entityType: "MarketCriteria", entityId: row.id, metadata: { version: row.version }, ip });
    return row;
  });
}

async function applyApproval(tx: Prisma.TransactionClient, marketId: string, question: string, deadline: Date, status: string) {
  await tx.market.update({
    where: { id: marketId },
    data: {
      question,
      resolutionDeadline: deadline,
      status: status === "DRAFT" ? "ACTIVE" : undefined,
      // Approved rules changed: any previous on-chain anchor no longer matches.
      criteriaHash: null,
      anchorSignature: null,
    },
  });
}

