import { route, notFound } from "@/lib/server/api";
import { limiters } from "@/lib/server/rate-limit";
import { verifyLock } from "@/lib/services/lock";

/** Public: anyone can check that a market's rules still match what was locked on Solana. */
export const GET = route<{ id: string }>({ limiter: limiters.verify }, async ({ params }) => {
  const v = await verifyLock(params.id);
  if (!v) throw notFound("Market");
  return v;
});
