import { promises as fs } from "node:fs";
import { NextResponse, type NextRequest } from "next/server";
import { outboxPath } from "@/lib/server/email";
import { e2eTestMode } from "@/lib/auth/token-rules";

export const dynamic = "force-dynamic";

/**
 * E2E-only: returns emails written by the "outbox" transport so browser tests can
 * follow verification and reset links. Returns 404 unless E2E_TEST_MODE=1 and
 * APP_URL is localhost (see e2eTestMode).
 */
export async function GET(req: NextRequest) {
  if (!e2eTestMode()) return new NextResponse(null, { status: 404 });
  const to = req.nextUrl.searchParams.get("to")?.toLowerCase();
  let list: { to: string; subject: string; text: string; kind: string; at: string }[] = [];
  try {
    list = JSON.parse(await fs.readFile(outboxPath(), "utf8"));
  } catch {
    list = [];
  }
  return NextResponse.json({ data: to ? list.filter((m) => m.to.toLowerCase() === to) : list });
}
