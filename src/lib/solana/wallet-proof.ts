/**
 * Wallet ownership proof (sign-in-with-Solana style). The user signs a
 * human-readable message off-chain; it cannot authorise any transaction.
 * Pure module — unit tested with real ed25519 signatures.
 */
import nacl from "tweetnacl";
import { base58Decode, isSolanaAddress } from "./base58";

export function buildLinkMessage(p: { address: string; email: string; nonce: string; issuedAt: Date; expiresAt: Date; network: string; domain: string }) {
  return [
    `${p.domain} wants you to link this Solana wallet to your Lockline account.`,
    "",
    `Wallet: ${p.address}`,
    `Account: ${p.email}`,
    `Network: ${p.network}`,
    `Nonce: ${p.nonce}`,
    `Issued At: ${p.issuedAt.toISOString()}`,
    `Expires At: ${p.expiresAt.toISOString()}`,
    "",
    "Signing this message is free. It does not authorise any transaction or transfer.",
  ].join("\n");
}

export function verifyWalletSignature(address: string, message: string, signatureBase64: string): boolean {
  if (!isSolanaAddress(address)) return false;
  let sig: Uint8Array;
  try {
    sig = Uint8Array.from(Buffer.from(signatureBase64, "base64"));
  } catch {
    return false;
  }
  if (sig.length !== 64) return false;
  return nacl.sign.detached.verify(new TextEncoder().encode(message), sig, base58Decode(address));
}
