/**
 * Public (browser-safe) configuration. Only NEXT_PUBLIC_* values belong here.
 * Secrets live in src/lib/server/env.ts and are never imported by client code.
 */
export type SolanaNetwork = "devnet" | "mainnet-beta";

const network = (process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? "devnet") as SolanaNetwork;

export const publicConfig = {
  appName: "IntelPro",
  tagline: "Intelligence Behind Every Prediction.",
  solana: {
    network,
    rpcUrl:
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
      (network === "mainnet-beta" ? "https://api.mainnet-beta.solana.com" : "https://api.devnet.solana.com"),
  },
  predict: {
    // Devnet constants published in the official pm-AMM HACKATHON.md.
    programId: process.env.NEXT_PUBLIC_PM_AMM_PROGRAM_ID ?? "GV1FMGHRYBjQLaghE5fnGuYCuCcpdt3GD5xEX3TwN16y",
    usdcMint: process.env.NEXT_PUBLIC_PM_AMM_USDC_MINT ?? "3WQ8hCqTNwjrh8WzE2XyoZoUrd1miPcwWfMkmFPUMEWZ",
    usdcDecimals: 6,
    faucetUrl: process.env.NEXT_PUBLIC_PM_AMM_FAUCET_URL ?? "https://pm-amm-devnet.vercel.app/api/faucet",
    feeRate: 0.02,
    minDurationSecs: 300,
    marketAccountSize: 443,
  },
} as const;

export const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

export function explorerTxUrl(signature: string, net: SolanaNetwork = network) {
  const cluster = net === "mainnet-beta" ? "" : `?cluster=${net}`;
  return `https://explorer.solana.com/tx/${signature}${cluster}`;
}

export function explorerAddressUrl(address: string, net: SolanaNetwork = network) {
  const cluster = net === "mainnet-beta" ? "" : `?cluster=${net}`;
  return `https://explorer.solana.com/address/${address}${cluster}`;
}
