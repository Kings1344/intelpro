import { db } from "@/lib/db";
import { route, parseJson } from "@/lib/server/api";
import { notificationReadSchema } from "@/lib/validation";

export const GET = route({ auth: true }, async ({ user }) => {
  const [items, unread] = await Promise.all([
    db.notification.findMany({ where: { userId: user!.id }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.notification.count({ where: { userId: user!.id, readAt: null } }),
  ]);
  return { items, unread };
});

export const PATCH = route({ auth: true }, async ({ req, user }) => {
  const body = await parseJson(req, notificationReadSchema);
  const r = await db.notification.updateMany({
    where: { userId: user!.id, readAt: null, ...(body.all ? {} : { id: { in: body.ids ?? [] } }) },
    data: { readAt: new Date() },
  });
  return { updated: r.count };
});
