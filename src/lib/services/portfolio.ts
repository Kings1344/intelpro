import "server-only";
import { db } from "@/lib/db";
import { publicConfig } from "@/lib/config";
import { serverRpcUrl } from "@/lib/solana/server";
import { fetchBalanceLamports, fetchSignaturesForAddress, fetchTokenAccounts } from "@/lib/solana/tx-verify";
import { discoverPredictMarkets } from "@/lib/predict/server";

export type Position = { market: string; name: string; side: "YES" | "NO"; amount: number; yesPrice: number | null; phase: string };

/** Everything here is read live from chain or from recorded, verified transactions. No balances are fabricated. */
export async function getPortfolio(userId: string) {
  const wallets = await db.wallet.findMany({ where: { userId } });
  const recorded = await db.transaction.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50, include: { market: { select: { id: true, question: true } } } });
  const rpc = serverRpcUrl();
  const { markets, status: predictStatus } = await discoverPredictMarkets();
  const mintIndex = new Map<string, { m: (typeof markets)[number]; side: "YES" | "NO" }>();
  for (const m of markets) {
    if (m.yesMint) mintIndex.set(m.yesMint, { m, side: "YES" });
    if (m.noMint) mintIndex.set(m.noMint, { m, side: "NO" });
  }

  const walletData = await Promise.all(
    wallets.map(async (w) => {
      try {
        const [lamports, sigs, tokens] = await Promise.all([fetchBalanceLamports(rpc, w.address), fetchSignaturesForAddress(rpc, w.address, 15), fetchTokenAccounts(rpc, w.address)]);
        const usdc = tokens.find((t) => t.mint === publicConfig.predict.usdcMint);
        const positions: Position[] = tokens
          .filter((t) => mintIndex.has(t.mint) && Number(t.amount.amount) > 0)
          .map((t) => {
            const { m, side } = mintIndex.get(t.mint)!;
            return { market: m.pda, name: m.name, side, amount: t.amount.uiAmount ?? Number(t.amount.amount) / 10 ** t.amount.decimals, yesPrice: m.yesPrice, phase: m.phase };
          });
        return {
          address: w.address,
          network: w.network,
          verifiedAt: w.verifiedAt,
          live: true as const,
          sol: lamports / 1e9,
          musdc: usdc ? (usdc.amount.uiAmount ?? 0) : 0,
          positions,
          chainActivity: sigs.map((s) => ({ signature: s.signature, slot: s.slot, ok: !s.err, at: s.blockTime ? new Date(s.blockTime * 1000).toISOString() : null, status: s.confirmationStatus })),
          error: null,
        };
      } catch (e) {
        return { address: w.address, network: w.network, verifiedAt: w.verifiedAt, live: false as const, sol: null, musdc: null, positions: [], chainActivity: [], error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );

  const participation = await db.market.findMany({
    where: { OR: [{ creatorId: userId }, { evidence: { some: { submittedById: userId } } }, { disputes: { some: { challengerId: userId } } }] },
    select: { id: true, question: true, status: true, isDemo: true },
    take: 30,
  });

  return {
    wallets: walletData,
    predictStatus,
    transactions: recorded.map((t) => ({ ...t, slot: t.slot?.toString() ?? null })),
    participation,
  };
}
