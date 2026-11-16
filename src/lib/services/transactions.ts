import "server-only";
import type { TxKind } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError, badRequest, forbidden, notFound } from "@/lib/server/api";
import { analyseTransaction, fetchChainTransaction, type Expectations } from "@/lib/solana/tx-verify";
import { serverRpcUrl, activeNetwork } from "@/lib/solana/server";
import { MEMO_PROGRAM_ID, publicConfig } from "@/lib/config";
import { anchorMemo, criteriaHash } from "@/lib/solana/anchor-memo";
import { activity, audit } from "@/lib/server/audit";
import { latestApproved } from "./markets";
import type { SessionUser } from "@/lib/auth/session";

async function expectedFor(kind: TxKind, wallet: string, marketId?: string | null): Promise<{ expect: Expectations; memo?: string; hash?: string }> {
  if (kind === "CRITERIA_ANCHOR") {
    if (!marketId) throw badRequest("marketId is required for criteria anchoring.");
    const m = await db.market.findUnique({ where: { id: marketId }, include: { criteria: { orderBy: { version: "desc" } } } });
    if (!m) throw notFound("Market");
    const c = latestApproved(m.criteria);
    if (!c) throw badRequest("Market has no approved criteria.");
    const hash = await criteriaHash({
      marketId: m.id, version: c.version, improvedQuestion: c.improvedQuestion, yesCondition: c.yesCondition, noCondition: c.noCondition,
      resolutionDeadline: c.resolutionDeadline.toISOString(), timezone: c.timezone, dataSource: c.dataSource, methodology: c.methodology,
    });
    const memo = anchorMemo(m.id, c.version, hash);
    return { expect: { signer: wallet, programId: MEMO_PROGRAM_ID, memo }, memo, hash };
  }
  if (kind === "WALLET_TEST") return { expect: { signer: wallet } };
  return { expect: { signer: wallet, programId: publicConfig.predict.programId } };
}

export async function recordAndVerify(user: SessionUser, input: { signature: string; kind: TxKind; marketId?: string; walletAddress: string }, ip: string | null) {
  const wallet = await db.wallet.findUnique({ where: { address: input.walletAddress } });
  if (!wallet || wallet.userId !== user.id) throw forbidden("Link and verify this wallet in Settings before recording its transactions.");
  const existing = await db.transaction.findUnique({ where: { signature: input.signature } });
  if (existing && existing.userId !== user.id) throw forbidden("This signature is recorded by another account.");

  const { expect, memo, hash } = await expectedFor(input.kind, input.walletAddress, input.marketId);
  const row =
    existing ??
    (await db.transaction.create({
      data: { userId: user.id, marketId: input.marketId ?? null, walletAddress: input.walletAddress, signature: input.signature, network: activeNetwork, kind: input.kind, status: "SUBMITTED", memo: memo ?? null },
    }));
  const verdict = await verify(row.signature, expect, row.createdAt);
  const updated = await db.transaction.update({
    where: { id: row.id },
    data: { status: verdict.status, slot: verdict.slot !== null ? BigInt(verdict.slot) : null, blockTime: verdict.blockTime, error: verdict.error, verifiedAt: new Date() },
  });

  if (input.kind === "CRITERIA_ANCHOR" && (verdict.status === "CONFIRMED" || verdict.status === "FINALIZED") && input.marketId && hash) {
    await db.$transaction(async (tx) => {
      await tx.market.update({ where: { id: input.marketId }, data: { criteriaHash: hash, anchorSignature: input.signature } });
      await activity(tx, { marketId: input.marketId!, actorId: user.id, type: "criteria.anchored", message: `Criteria hash anchored on Solana ${activeNetwork}`, metadata: { signature: input.signature, hash } });
    });
  }
  await audit(db, { actorId: user.id, action: "tx.verify", entityType: "Transaction", entityId: updated.id, metadata: { kind: input.kind, status: verdict.status, checks: verdict.checks }, ip });
  return { ...updated, slot: updated.slot?.toString() ?? null, checks: verdict.checks };
}

export async function refreshTransaction(user: SessionUser, signature: string) {
  const row = await db.transaction.findUnique({ where: { signature } });
  if (!row || row.userId !== user.id) throw notFound("Transaction");
  const { expect } = await expectedFor(row.kind, row.walletAddress, row.marketId);
  const verdict = await verify(signature, expect, row.createdAt);
  const updated = await db.transaction.update({
    where: { id: row.id },
    data: { status: verdict.status, slot: verdict.slot !== null ? BigInt(verdict.slot) : null, blockTime: verdict.blockTime, error: verdict.error, verifiedAt: new Date() },
  });
  return { ...updated, slot: updated.slot?.toString() ?? null, checks: verdict.checks };
}

async function verify(signature: string, expect: Expectations, submittedAt: Date) {
  try {
    const { tx, status } = await fetchChainTransaction(serverRpcUrl(), signature);
    return analyseTransaction(tx, status, expect, { submittedAt });
  } catch (e) {
    throw new ApiError(502, "rpc_unavailable", `Could not reach the Solana RPC to verify: ${e instanceof Error ? e.message : e}`);
  }
}
