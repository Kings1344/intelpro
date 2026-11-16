import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { route, parseJson } from "@/lib/server/api";
import { walletNonceSchema } from "@/lib/validation";
import { buildLinkMessage } from "@/lib/solana/wallet-proof";
import { activeNetwork } from "@/lib/solana/server";

/** Issues a single-use, 10-minute message for the wallet to sign. */
export const POST = route({ auth: true }, async ({ req, user }) => {
  const { address } = await parseJson(req, walletNonceSchema);
  const nonce = randomBytes(16).toString("hex");
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + 10 * 60_000);
  const domain = new URL(process.env.APP_URL ?? "http://localhost:3000").host;
  const message = buildLinkMessage({ address, email: user!.email, nonce, issuedAt, expiresAt, network: activeNetwork, domain });
  await db.walletNonce.create({ data: { userId: user!.id, address, nonce, message, expiresAt } });
  return { nonce, message };
});
