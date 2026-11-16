import { db } from "@/lib/db";
import { route, notFound, badRequest, forbidden } from "@/lib/server/api";
import { latestApproved } from "@/lib/services/markets";
import { anchorMemo, criteriaHash } from "@/lib/solana/anchor-memo";
import { MEMO_PROGRAM_ID } from "@/lib/config";

/**
 * Returns the memo the user's wallet should sign to anchor the approved criteria
 * on Solana. The client submits the transaction; POST /api/transactions then
 * verifies on-chain that the memo, signer and status match before recording it.
 */
export const POST = route<{ id: string }>({ auth: true }, async ({ params, user }) => {
  const market = await db.market.findUnique({ where: { id: params.id }, include: { criteria: { orderBy: { version: "desc" } } } });
  if (!market) throw notFound("Market");
  if (market.isDemo) throw forbidden("Demonstration markets cannot be anchored on-chain.");
  if (market.creatorId !== user!.id && user!.role !== "ADMIN") throw forbidden("Only the market creator can anchor its rules.");
  const c = latestApproved(market.criteria);
  if (!c) throw badRequest("Approve the resolution criteria first.");
  const hash = await criteriaHash({
    marketId: market.id,
    version: c.version,
    improvedQuestion: c.improvedQuestion,
    yesCondition: c.yesCondition,
    noCondition: c.noCondition,
    resolutionDeadline: c.resolutionDeadline.toISOString(),
    timezone: c.timezone,
    dataSource: c.dataSource,
    methodology: c.methodology,
  });
  return { memo: anchorMemo(market.id, c.version, hash), hash, version: c.version, memoProgramId: MEMO_PROGRAM_ID };
});
