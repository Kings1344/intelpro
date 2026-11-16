import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aiConfigured } from "@/lib/server/env";
import { emailTransport } from "@/lib/server/email";
import { publicConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

/** Liveness + readiness. 503 when the database is unreachable. Reveals no secrets or versions. */
export async function GET() {
  let database = "ok";
  let migrations: number | null = null;
  try {
    await db.$queryRaw`SELECT 1`;
    const rows = await db.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`.catch(() => null);
    migrations = rows ? Number(rows[0].n) : null;
  } catch {
    database = "unreachable";
  }
  return NextResponse.json(
    {
      status: database === "ok" ? "ok" : "degraded",
      database,
      migrationsApplied: migrations,
      ai: aiConfigured() ? "configured" : "heuristic-only",
      email: emailTransport(),
      solanaNetwork: publicConfig.solana.network,
      time: new Date().toISOString(),
    },
    { status: database === "ok" ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
