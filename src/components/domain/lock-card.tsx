"use client";
import { useState } from "react";
import Link from "next/link";
import { Check, ExternalLink, Lock, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, ClientApiError } from "@/lib/client/api";
import { explorerAddressUrl, explorerTxUrl } from "@/lib/config";
import type { LockVerdict } from "@/lib/solana/lock-verdict";
import { cn } from "@/lib/utils";

type Props = {
  marketId: string;
  approvedVersion: number | null;
  criteriaHash: string | null;
  anchorSignature: string | null;
  predictMarketPda: string | null;
  isDemo: boolean;
};

const VERDICT_TONE = { verified: "emerald", changed: "amber", mismatch: "rust", failed: "rust", pending: "steel", unlocked: "neutral" } as const;
const VERDICT_LABEL = { verified: "Verified on-chain", changed: "Rules changed since lock", mismatch: "Does not match chain", failed: "Lock transaction invalid", pending: "Waiting for the cluster", unlocked: "Not locked" } as const;

/**
 * The market's lock status: rules approved → hash locked on Solana → live on PREDICT,
 * plus a public check that recomputes the hash and compares it with the chain.
 */
export function LockCard(p: Props) {
  const [verdict, setVerdict] = useState<LockVerdict | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const steps = [
    { done: p.approvedVersion !== null, title: "Rules approved", body: p.approvedVersion !== null ? `Version ${p.approvedVersion}` : "Approve the rules below first." },
    {
      done: !!p.anchorSignature,
      title: "Locked on Solana",
      body: p.criteriaHash ? `SHA-256 ${p.criteriaHash.slice(0, 10)}…${p.criteriaHash.slice(-6)}` : p.isDemo ? "Sample markets are never locked." : "Not locked yet.",
      link: p.anchorSignature ? { href: explorerTxUrl(p.anchorSignature), label: "Lock transaction" } : null,
    },
    {
      done: !!p.predictMarketPda,
      title: "Live on PREDICT",
      body: p.predictMarketPda ? `${p.predictMarketPda.slice(0, 6)}…${p.predictMarketPda.slice(-4)}` : "No pm-AMM market launched yet.",
      link: p.predictMarketPda ? { href: explorerAddressUrl(p.predictMarketPda), label: "Market account" } : null,
      inner: p.predictMarketPda ? { href: `/markets/predict/${p.predictMarketPda}`, label: "Trade" } : null,
    },
  ];

  async function check() {
    setBusy(true);
    setError(null);
    try {
      setVerdict(await api<LockVerdict>(`/api/markets/${p.marketId}/verify-lock`));
    } catch (e) {
      setError(e instanceof ClientApiError ? e.message : "Could not reach the Solana RPC. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Rules lock" className="mb-6 rounded-[var(--radius-container)] border border-line bg-surface">
      <ol className="grid grid-cols-1 divide-y divide-line md:grid-cols-3 md:divide-x md:divide-y-0">
        {steps.map((s) => (
          <li key={s.title} className="flex gap-3 p-4">
            <span className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border", s.done ? "border-emerald/40 bg-emerald-wash text-emerald-soft" : "border-line-strong text-faint")}>
              {s.done ? <Check className="size-3.5" /> : <Lock className="size-3" />}
            </span>
            <div className="min-w-0">
              <p className={cn("text-[13.5px] font-medium", s.done ? "text-fg" : "text-muted")}>{s.title}</p>
              <p className="mt-0.5 truncate font-mono text-[12px] text-faint">{s.body}</p>
              <div className="mt-1 flex flex-wrap gap-3 text-[12.5px]">
                {s.link && <a className="inline-flex items-center gap-1 text-emerald hover:underline" href={s.link.href} target="_blank" rel="noreferrer">{s.link.label} <ExternalLink className="size-3" /></a>}
                {s.inner && <Link className="text-emerald hover:underline" href={s.inner.href}>{s.inner.label}</Link>}
              </div>
            </div>
          </li>
        ))}
      </ol>
      {p.anchorSignature && (
        <div className="flex flex-col gap-3 border-t border-line p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-[13px]" aria-live="polite">
            {verdict ? (
              <div className="space-y-1">
                <Badge tone={VERDICT_TONE[verdict.state]} dot>{VERDICT_LABEL[verdict.state]}</Badge>
                <p className="text-muted">{verdict.detail}</p>
                {verdict.slot !== null && <p className="text-[12px] text-faint">Slot {verdict.slot.toLocaleString()}{verdict.lockedAt ? `, ${new Date(verdict.lockedAt).toLocaleString()}` : ""}</p>}
              </div>
            ) : error ? (
              <p className="text-rust">{error}</p>
            ) : (
              <p className="text-muted">Anyone can check that the rules on this page are the ones locked on Solana.</p>
            )}
          </div>
          <Button onClick={check} disabled={busy} className="shrink-0">
            {verdict?.state === "verified" ? <ShieldCheck className="size-4" /> : <ShieldAlert className="size-4" />}
            {busy ? "Checking the chain…" : verdict ? "Check again" : "Verify on-chain"}
          </Button>
        </div>
      )}
    </section>
  );
}
