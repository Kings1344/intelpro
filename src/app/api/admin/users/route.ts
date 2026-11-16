import { db } from "@/lib/db";
import { route } from "@/lib/server/api";

export const GET = route({ permission: "admin:users" }, async () =>
  db.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, email: true, name: true, role: true, isDemo: true, createdAt: true, _count: { select: { markets: true, evidence: true, disputes: true } } },
  }),
);
