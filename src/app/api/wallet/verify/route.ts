import { db } from "@/lib/db";
import { route, parseJson, badRequest, conflict } from "@/lib/server/api";
import { walletVerifySchema } from "@/lib/validation";
import { verifyWalletSignature } from "@/lib/solana/wallet-proof";
import { activeNetwork } from "@/lib/solana/server";
import { audit } from "@/lib/server/audit";

/** Verifies the ed25519 signature over the issued message and links the wallet. */
export const POST = route({ auth: true }, async ({ req, user, ip }) => {
  const body = await parseJson(req, walletVerifySchema);
  const n = await db.walletNonce.findUnique({ where: { nonce: body.nonce } });
  if (!n || n.userId !== user!.id || n.address !== body.address) throw badRequest("Unknown or mismatched nonce.");
  if (n.usedAt) throw badRequest("This nonce has already been used.");
  if (n.expiresAt < new Date()) throw badRequest("This signing request expired. Start again.");
  if (!verifyWalletSignature(body.address, n.message, body.signature)) throw badRequest("Signature verification failed.");

  const existing = await db.wallet.findUnique({ where: { address: body.address } });
  if (existing && existing.userId !== user!.id) throw conflict("This wallet is linked to another account.");

  return db.$transaction(async (tx) => {
    await tx.walletNonce.update({ where: { id: n.id }, data: { usedAt: new Date() } });
    const w = existing
      ? await tx.wallet.update({ where: { id: existing.id }, data: { verifiedAt: new Date(), network: activeNetwork } })
      : await tx.wallet.create({ data: { userId: user!.id, address: body.address, network: activeNetwork, verifiedAt: new Date() } });
    await audit(tx, { actorId: user!.id, action: "wallet.link", entityType: "Wallet", entityId: w.id, metadata: { address: w.address }, ip });
    return w;
  });
});
