"use client";
import { ActionButton } from "@/components/domain/action-button";

export function RefreshTx({ signature }: { signature: string }) {
  return <ActionButton endpoint={`/api/transactions/${signature}/refresh`} label="Re-verify" success="Status re-checked on-chain" variant="ghost" />;
}
