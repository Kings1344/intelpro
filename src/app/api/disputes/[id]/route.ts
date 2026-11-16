import { db } from "@/lib/db";
import { route, notFound } from "@/lib/server/api";

export const GET = route<{ id: string }>({}, async ({ params }) => {
  const d = await db.dispute.findUnique({
    where: { id: params.id },
    include: {
      market: { include: { criteria: { where: { approved: true }, take: 1 } } },
      recommendation: true,
      challenger: { select: { id: true, name: true } },
      reviewer: { select: { id: true, name: true } },
      evidence: { include: { analyses: { orderBy: { createdAt: "desc" }, take: 1 } } },
      comments: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, name: true, role: true } } } },
    },
  });
  if (!d) throw notFound("Dispute");
  const audit = await db.auditLog.findMany({ where: { entityType: "Dispute", entityId: d.id }, orderBy: { createdAt: "asc" }, include: { actor: { select: { name: true } } } });
  return { ...d, audit };
});
