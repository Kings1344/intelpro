/**
 * Lock verification: compares the hash of the rules Lockline shows today with the
 * hash written to Solana when the market was locked. Pure, unit tested; the I/O
 * lives in services/lock.ts.
 */
import { parseAnchorMemo } from "./anchor-memo";

export type LockState =
  | "unlocked" // no lock transaction recorded
  | "verified" // on-chain hash equals the hash of the rules shown now
  | "changed" // rules were edited after the lock; the shown rules are not the locked ones
  | "mismatch" // the chain holds a different hash for this market and version
  | "pending" // transaction not visible on the cluster yet
  | "failed"; // transaction failed or carries no Lockline memo

export type LockVerdict = {
  state: LockState;
  currentHash: string | null;
  currentVersion: number | null;
  onChainHash: string | null;
  onChainVersion: number | null;
  signature: string | null;
  slot: number | null;
  lockedAt: string | null;
  detail: string;
};

export function lockVerdict(input: {
  marketId: string;
  currentHash: string | null;
  currentVersion: number | null;
  signature: string | null;
  chain: { status: "SUBMITTED" | "CONFIRMED" | "FINALIZED" | "FAILED" | "NOT_FOUND"; memos: string[]; slot: number | null; blockTime: Date | null } | null;
}): LockVerdict {
  const base = {
    currentHash: input.currentHash,
    currentVersion: input.currentVersion,
    onChainHash: null as string | null,
    onChainVersion: null as number | null,
    signature: input.signature,
    slot: input.chain?.slot ?? null,
    lockedAt: input.chain?.blockTime?.toISOString() ?? null,
  };
  if (!input.signature || !input.chain) return { ...base, state: "unlocked", detail: "These rules have not been locked on Solana yet." };
  if (input.chain.status === "SUBMITTED" || input.chain.status === "NOT_FOUND")
    return { ...base, state: "pending", detail: "The lock transaction is not visible on the cluster yet. Try again in a minute." };

  const memo = input.chain.memos.map(parseAnchorMemo).find((m) => m && m.marketId === input.marketId) ?? null;
  if (input.chain.status === "FAILED" || !memo)
    return { ...base, state: "failed", detail: "The recorded transaction did not lock these rules: it failed or carries no Lockline memo for this market." };

  const withChain = { ...base, onChainHash: memo.hash, onChainVersion: memo.version };
  if (input.currentVersion !== null && memo.version !== input.currentVersion)
    return { ...withChain, state: "changed", detail: `Locked rules are version ${memo.version}; the approved rules shown now are version ${input.currentVersion}. Lock the new version before relying on it.` };
  if (memo.hash !== input.currentHash)
    return { ...withChain, state: "mismatch", detail: "The rules shown here do not match what was locked on-chain. Do not rely on them." };
  return { ...withChain, state: "verified", detail: "The rules shown here are exactly the rules locked on Solana. They have not changed since." };
}
