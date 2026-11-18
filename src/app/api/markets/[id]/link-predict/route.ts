import { db } from "@/lib/db";
import { route, parseJson, notFound, forbidden, badRequest, conflict } from "@/lib/server/api";
import { linkPredictSchema } from "@/lib/validation";
import { recordAndVerify } from "@/lib/services/transactions";
import { getPredictMarket } from "@/lib/predict/server";
import { activity, audit } from "@/lib/server/audit";

/**
 * Links an Lockline market to a PREDICT pm-AMM market created by the user's wallet.
 * Requires: a confirmed creation tx signed by the user's verified wallet that
 * invoked the pm-AMM program, and an on-chain market account whose authority is that wallet.
 */
export const POST = route<{ id: string }>({ permission: "market:create" }, async ({ req, params, user, ip }) => {
  const body = await parseJson(req, linkPredictSchema);
  const market = await db.market.findUnique({ where: { id: params.id } });
  if (!market) throw notFound("Market");
  if (market.creatorId !== user!.id) throw forbidden("Only the market creator can link a PREDICT market.");
  if (market.predictMarketPda) throw conflict("This market is already linked to a PREDICT market.");

  const tx = await recordAndVerify(user!, { signature: body.signature, kind: "PREDICT_CREATE_MARKET", marketId: market.id, walletAddress: body.walletAddress }, ip);
  if (tx.status !== "CONFIRMED" && tx.status !== "FINALIZED")
    throw badRequest(`Creation transaction is ${tx.status.toLowerCase()} on-chain; it must be confirmed before linking. You can retry once it confirms.`);
  const onchain = await getPredictMarket(body.marketPda);
  if (!onchain) throw badRequest("No PREDICT market account was found at that address.");
  // Vault-launched markets are owned by the vault program flow, so the authority check applies to direct creations only.
  if (!body.viaVault && onchain.authority && onchain.authority !== body.walletAddress) throw forbidden("The PREDICT market authority is not your wallet.");

  return db.$transaction(async (t) => {
    const m = await t.market.update({ where: { id: market.id }, data: { predictMarketPda: body.marketPda } });
    await activity(t, { marketId: market.id, actorId: user!.id, type: "predict.linked", message: "Linked to a live PREDICT pm-AMM market", metadata: { pda: body.marketPda, signature: body.signature, viaVault: body.viaVault } });
    await audit(t, { actorId: user!.id, action: "predict.link", entityType: "Market", entityId: market.id, metadata: { pda: body.marketPda }, ip });
    return { id: m.id, predictMarketPda: m.predictMarketPda };
  });
});
