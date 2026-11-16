import { db } from "@/lib/db";
import { route } from "@/lib/server/api";

export const GET = route({ auth: true }, async ({ user }) => db.wallet.findMany({ where: { userId: user!.id }, orderBy: { createdAt: "asc" } }));
