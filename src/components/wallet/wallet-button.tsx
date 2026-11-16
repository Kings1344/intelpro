"use client";
import dynamic from "next/dynamic";

// The adapter button reads window state; render it client-only to avoid hydration mismatches.
export const WalletButton = dynamic(() => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton), {
  ssr: false,
  loading: () => <div className="h-[34px] w-[132px] rounded-[var(--radius-control)] border border-line-strong bg-raised" />,
});
