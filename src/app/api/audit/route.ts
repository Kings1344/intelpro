import { db } from "@/lib/db";
import { route } from "@/lib/server/api";

export const GET = route({ permission: "admin:audit" }, async ({ req }) => {
  const entityType = req.nextUrl.searchParams.get("entityType") ?? undefined;
  const entityId = req.nextUrl.searchParams.get("entityId") ?? undefined;
  return db.auditLog.findMany({ where: { entityType, entityId }, orderBy: { createdAt: "desc" }, take: 200, include: { actor: { select: { name: true, email: true } } } });
});
