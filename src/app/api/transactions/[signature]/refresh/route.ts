import { route, badRequest } from "@/lib/server/api";
import { refreshTransaction } from "@/lib/services/transactions";
import { isSolanaSignature } from "@/lib/solana/base58";

export const POST = route<{ signature: string }>({ auth: true }, async ({ params, user }) => {
  if (!isSolanaSignature(params.signature)) throw badRequest("Invalid signature.");
  return refreshTransaction(user!, params.signature);
});
