import { db } from "@/lib/db";
import { route, parseJson, badRequest, notFound } from "@/lib/server/api";
import { roleUpdateSchema } from "@/lib/validation";
import { audit, notify } from "@/lib/server/audit";

export const PATCH = route<{ id: string }>({ permission: "admin:users" }, async ({ req, params, user, ip }) => {
  const { role } = await parseJson(req, roleUpdateSchema);
  if (params.id === user!.id && role !== "ADMIN") throw badRequest("Administrators cannot demote themselves.");
  const target = await db.user.findUnique({ where: { id: params.id } });
  if (!target) throw notFound("User");
  return db.$transaction(async (tx) => {
    const updated = await tx.user.update({ where: { id: params.id }, data: { role }, select: { id: true, role: true } });
    await audit(tx, { actorId: user!.id, action: "admin.role_change", entityType: "User", entityId: params.id, metadata: { from: target.role, to: role }, ip });
    await notify(tx, { userId: params.id, type: "role.changed", title: "Your role changed", body: `You are now: ${role.replace("_", " ").toLowerCase()}.`, link: "/settings" });
    return updated;
  });
});
