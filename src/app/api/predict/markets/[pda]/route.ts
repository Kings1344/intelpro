import { db } from "@/lib/db";
import { route, notFound, badRequest } from "@/lib/server/api";
import { getPredictMarket, getVaultLiquidity } from "@/lib/predict/server";
import { isSolanaAddress } from "@/lib/solana/base58";

export const GET = route<{ pda: string }>({}, async ({ params }) => {
  if (!isSolanaAddress(params.pda)) throw badRequest("Invalid market address.");
  const m = await getPredictMarket(params.pda);
  if (!m) throw notFound("PREDICT market");
  const linked = await db.market.findUnique({ where: { predictMarketPda: params.pda }, select: { id: true, question: true } });
  return { ...m, liquidityUsdc: await getVaultLiquidity(m.vault), intelproMarket: linked };
});
