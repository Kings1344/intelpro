import { db } from "@/lib/db";
import { route, parseJson, notFound, badRequest } from "@/lib/server/api";
import { evidenceInput } from "@/lib/validation";
import { checkPublicUrl } from "@/lib/evidence/safe-url";
import { activity, audit, notify } from "@/lib/server/audit";

export const GET = route<{ id: string }>({}, async ({ params }) => {
  const market = await db.market.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!market) throw notFound("Market");
  return db.evidence.findMany({
    where: { marketId: params.id },
    orderBy: { createdAt: "desc" },
    include: { analyses: { orderBy: { createdAt: "desc" } }, submittedBy: { select: { name: true } } },
  });
});

/** Records evidence with status SUBMITTED. Nothing is claimed as verified until the analysis pipeline runs. */
export const POST = route<{ id: string }>({ permission: "evidence:submit" }, async ({ req, params, user, ip }) => {
  const body = await parseJson(req, evidenceInput);
  const urlCheck = checkPublicUrl(body.sourceUrl);
  if (!urlCheck.ok) throw badRequest(`Source URL rejected: ${urlCheck.reason}`);
  const market = await db.market.findUnique({ where: { id: params.id }, select: { id: true, creatorId: true, question: true, status: true } });
  if (!market) throw notFound("Market");
  if (["RESOLVED", "CANCELLED"].includes(market.status)) throw badRequest("This market is closed to new evidence.");
  return db.$transaction(async (tx) => {
    const ev = await tx.evidence.create({
      data: {
        marketId: market.id,
        submittedById: user!.id,
        title: body.title,
        sourceName: body.sourceName,
        sourceUrl: urlCheck.url.toString(),
        description: body.description,
        publishedAt: body.publishedAt ? new Date(body.publishedAt) : null,
        category: body.category,
        claimedStance: body.claimedStance,
        status: "SUBMITTED",
      },
    });
    await activity(tx, { marketId: market.id, actorId: user!.id, type: "evidence.submitted", message: `Evidence submitted: ${body.title}` });
    await audit(tx, { actorId: user!.id, action: "evidence.submit", entityType: "Evidence", entityId: ev.id, metadata: { url: ev.sourceUrl }, ip });
    if (market.creatorId && market.creatorId !== user!.id)
      await notify(tx, { userId: market.creatorId, type: "evidence.submitted", title: "New evidence submitted", body: market.question, link: `/evidence/${market.id}` });
    return ev;
  });
});
