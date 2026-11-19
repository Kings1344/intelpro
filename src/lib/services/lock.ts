import { db } from "@/lib/db";
import { latestApproved } from "./markets";
import { criteriaHash } from "@/lib/solana/anchor-memo";
import { analyseTransaction, fetchChainTransaction } from "@/lib/solana/tx-verify";
import { serverRpcUrl } from "@/lib/solana/server";
import { lockVerdict, type LockVerdict } from "@/lib/solana/lock-verdict";

/** Recomputes the approved rules' hash and checks it against the memo on Solana. */
export async function verifyLock(marketId: string): Promise<LockVerdict | null> {
  const m = await db.market.findUnique({ where: { id: marketId }, include: { criteria: { orderBy: { version: "desc" } } } });
  if (!m) return null;
  const c = latestApproved(m.criteria);
  const currentHash = c
    ? await criteriaHash({
        marketId: m.id, version: c.version, improvedQuestion: c.improvedQuestion, yesCondition: c.yesCondition, noCondition: c.noCondition,
        resolutionDeadline: c.resolutionDeadline.toISOString(), timezone: c.timezone, dataSource: c.dataSource, methodology: c.methodology,
      })
    : null;
  let chain = null;
  if (m.anchorSignature) {
    const { tx, status } = await fetchChainTransaction(serverRpcUrl(), m.anchorSignature);
    const v = analyseTransaction(tx, status, {});
    chain = { status: v.status, memos: v.memos, slot: v.slot, blockTime: v.blockTime };
  }
  return lockVerdict({ marketId: m.id, currentHash, currentVersion: c?.version ?? null, signature: m.anchorSignature, chain });
}
