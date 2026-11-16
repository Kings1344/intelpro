"use client";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { api } from "@/lib/client/api";

export type VerifiedTx = { signature: string; status: "SUBMITTED" | "CONFIRMED" | "FINALIZED" | "FAILED" | "NOT_FOUND"; error: string | null; checks?: { name: string; passed: boolean; detail: string }[] };

/** Shared wallet state + server-side verification of every submitted signature. */
export function useChain(linkedWallets: string[]) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const anchorWallet = useAnchorWallet();
  const address = wallet.publicKey?.toBase58() ?? null;
  const linked = address ? linkedWallets.includes(address) : false;

  async function recordTx(signature: string, kind: string, marketId?: string): Promise<VerifiedTx> {
    // Wait for the cluster before asking the server to verify; the server re-checks independently.
    try {
      const latest = await connection.getLatestBlockhash("confirmed");
      await connection.confirmTransaction({ signature, ...latest }, "confirmed");
    } catch {
      /* the server verdict below is authoritative either way */
    }
    return api<VerifiedTx>("/api/transactions", { body: { signature, kind, marketId, walletAddress: address } });
  }

  return { connection, wallet, anchorWallet, address, linked, recordTx };
}

export function txMessage(tx: VerifiedTx) {
  if (tx.status === "CONFIRMED" || tx.status === "FINALIZED") return { tone: "success" as const, title: `Transaction ${tx.status.toLowerCase()} on-chain` };
  if (tx.status === "FAILED") return { tone: "error" as const, title: "Transaction failed verification", body: tx.error ?? undefined };
  return { tone: "error" as const, title: `Transaction ${tx.status === "SUBMITTED" ? "submitted, not yet confirmed" : "not found on-chain"}`, body: "IntelPro will only mark it successful once the cluster confirms it. Refresh it from Portfolio." };
}
