import { db } from "@/lib/db";
import { route, parseJson } from "@/lib/server/api";
import { profileUpdateSchema } from "@/lib/validation";
import { audit } from "@/lib/server/audit";

export const GET = route({ auth: true }, async ({ user }) =>
  db.user.findUnique({
    where: { id: user!.id },
    select: { id: true, email: true, name: true, role: true, createdAt: true, wallets: { select: { address: true, network: true, verifiedAt: true } } },
  }),
);

export const PATCH = route({ auth: true }, async ({ req, user, ip }) => {
  const body = await parseJson(req, profileUpdateSchema);
  const updated = await db.user.update({ where: { id: user!.id }, data: { name: body.name }, select: { id: true, name: true } });
  await audit(db, { actorId: user!.id, action: "user.update_profile", entityType: "User", entityId: user!.id, ip });
  return updated;
});
