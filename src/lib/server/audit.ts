import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

type Tx = Prisma.TransactionClient | typeof db;

/** Append-only audit trail for every important action. */
export async function audit(
  tx: Tx,
  entry: { actorId?: string | null; action: string; entityType: string; entityId: string; metadata?: Prisma.InputJsonValue; ip?: string | null },
) {
  await tx.auditLog.create({
    data: {
      actorId: entry.actorId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      metadata: entry.metadata,
      ip: entry.ip ?? null,
    },
  });
}

/** Market-scoped activity feed entry (shown in timelines and the Intelligence Feed). */
export async function activity(
  tx: Tx,
  entry: { marketId: string; actorId?: string | null; type: string; message: string; metadata?: Prisma.InputJsonValue },
) {
  await tx.marketActivity.create({
    data: { marketId: entry.marketId, actorId: entry.actorId ?? null, type: entry.type, message: entry.message, metadata: entry.metadata },
  });
}

export async function notify(
  tx: Tx,
  entry: { userId: string; type: string; title: string; body: string; link?: string },
) {
  await tx.notification.create({ data: entry });
}
