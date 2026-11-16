import { db } from "@/lib/db";
import { route, notFound, badRequest } from "@/lib/server/api";
import { analyseEvidence } from "@/lib/services/evidence";
import { limiters } from "@/lib/server/rate-limit";

/** Runs the retrieval + analysis pipeline for one evidence record. */
export const POST = route<{ id: string }>({ permission: "evidence:analyse", limiter: limiters.fetch }, async ({ params, user }) => {
  const ev = await db.evidence.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!ev) throw notFound("Evidence");
  try {
    return await analyseEvidence(ev.id, user!.id);
  } catch (e) {
    throw badRequest(e instanceof Error ? e.message : "Analysis failed.");
  }
});
