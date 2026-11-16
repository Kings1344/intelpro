import { db } from "@/lib/db";
import { route, notFound } from "@/lib/server/api";
import { audit } from "@/lib/server/audit";

export const DELETE = route<{ address: string }>({ auth: true }, async ({ params, user, ip }) => {
  const w = await db.wallet.findUnique({ where: { address: params.address } });
  if (!w || w.userId !== user!.id) throw notFound("Wallet");
  await db.wallet.delete({ where: { id: w.id } });
  await audit(db, { actorId: user!.id, action: "wallet.unlink", entityType: "Wallet", entityId: w.id, metadata: { address: w.address }, ip });
  return { ok: true };
});
