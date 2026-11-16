import "server-only";
import { publicConfig } from "@/lib/config";

export function serverRpcUrl() {
  return process.env.SOLANA_RPC_URL || publicConfig.solana.rpcUrl;
}

export const activeNetwork = publicConfig.solana.network;
