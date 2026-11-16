import { db } from "@/lib/db";
import { route, parseJson } from "@/lib/server/api";
import { recordTxSchema } from "@/lib/validation";
import { recordAndVerify } from "@/lib/services/transactions";

export const GET = route({ auth: true }, async ({ user }) => {
  const rows = await db.transaction.findMany({ where: { userId: user!.id }, orderBy: { createdAt: "desc" }, take: 100, include: { market: { select: { question: true } } } });
  return rows.map((r) => ({ ...r, slot: r.slot?.toString() ?? null }));
});

/** Records a wallet-submitted signature and verifies it against the cluster. */
export const POST = route({ auth: true }, async ({ req, user, ip }) => {
  const body = await parseJson(req, recordTxSchema);
  return recordAndVerify(user!, body, ip);
});
