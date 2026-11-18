/**
 * Transaction verification against the chain. The analyser is pure and unit
 * tested with RPC-shaped fixtures; `fetchChainTransaction` performs JSON-RPC calls.
 * Lockline never marks a transaction successful unless the cluster says so.
 */

export type ParsedIx = { programId: string; program?: string; parsed?: unknown };
export type RpcTransaction = {
  slot: number;
  blockTime: number | null;
  meta: { err: unknown; innerInstructions?: { index: number; instructions: ParsedIx[] }[] | null } | null;
  transaction: {
    message: {
      accountKeys: ({ pubkey: string; signer: boolean; writable: boolean } | string)[];
      instructions: ParsedIx[];
    };
  };
};
export type RpcSignatureStatus = { slot: number; err: unknown; confirmationStatus: "processed" | "confirmed" | "finalized" | null } | null;

export type ChainVerdict = {
  status: "SUBMITTED" | "CONFIRMED" | "FINALIZED" | "FAILED" | "NOT_FOUND";
  slot: number | null;
  blockTime: Date | null;
  error: string | null;
  signers: string[];
  programIds: string[];
  memos: string[];
  checks: { name: string; passed: boolean; detail: string }[];
};

export type Expectations = { signer?: string; programId?: string; memo?: string };

export function analyseTransaction(
  tx: RpcTransaction | null,
  status: RpcSignatureStatus,
  expect: Expectations,
  opts: { submittedAt?: Date; now?: Date } = {},
): ChainVerdict {
  const now = opts.now ?? new Date();
  if (!tx && !status) {
    // Very recent submissions may not be visible yet; never call them failed or successful.
    const recent = opts.submittedAt && now.getTime() - opts.submittedAt.getTime() < 90_000;
    return { status: recent ? "SUBMITTED" : "NOT_FOUND", slot: null, blockTime: null, error: null, signers: [], programIds: [], memos: [], checks: [] };
  }
  const keys = tx?.transaction.message.accountKeys.map((k) => (typeof k === "string" ? { pubkey: k, signer: false, writable: false } : k)) ?? [];
  const signers = keys.filter((k) => k.signer).map((k) => k.pubkey);
  const ixs = [
    ...(tx?.transaction.message.instructions ?? []),
    ...((tx?.meta?.innerInstructions ?? []).flatMap((i) => i.instructions) ?? []),
  ];
  const programIds = [...new Set(ixs.map((i) => i.programId))];
  const memos = ixs.filter((i) => i.program === "spl-memo" && typeof i.parsed === "string").map((i) => i.parsed as string);

  const err = tx?.meta?.err ?? status?.err ?? null;
  const conf = status?.confirmationStatus ?? (tx ? "confirmed" : null);
  let st: ChainVerdict["status"] = err ? "FAILED" : conf === "finalized" ? "FINALIZED" : conf === "confirmed" ? "CONFIRMED" : "SUBMITTED";

  const checks: ChainVerdict["checks"] = [];
  if (expect.signer) checks.push({ name: "signer", passed: signers.includes(expect.signer), detail: `Expected signer ${expect.signer}` });
  if (expect.programId) checks.push({ name: "program", passed: programIds.includes(expect.programId), detail: `Expected program ${expect.programId}` });
  if (expect.memo) checks.push({ name: "memo", passed: memos.some((m) => m.replace(/^\[\d+\]\s*/, "") === expect.memo), detail: "Expected Lockline criteria memo" });
  if (tx && checks.some((c) => !c.passed) && st !== "FAILED") st = "FAILED";

  return {
    status: st,
    slot: tx?.slot ?? status?.slot ?? null,
    blockTime: tx?.blockTime ? new Date(tx.blockTime * 1000) : null,
    error: err ? JSON.stringify(err) : checks.filter((c) => !c.passed).map((c) => `Check failed: ${c.detail}`).join("; ") || null,
    signers,
    programIds,
    memos,
    checks,
  };
}

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`RPC ${method} HTTP ${res.status}`);
  const json = (await res.json()) as { result?: T; error?: { message: string } };
  if (json.error) throw new Error(`RPC ${method}: ${json.error.message}`);
  return json.result as T;
}

export async function fetchChainTransaction(rpcUrl: string, signature: string) {
  const [statuses, tx] = await Promise.all([
    rpc<{ value: RpcSignatureStatus[] }>(rpcUrl, "getSignatureStatuses", [[signature], { searchTransactionHistory: true }]),
    rpc<RpcTransaction | null>(rpcUrl, "getTransaction", [signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" }]),
  ]);
  return { tx, status: statuses.value?.[0] ?? null };
}

export async function fetchSignaturesForAddress(rpcUrl: string, address: string, limit = 20) {
  return rpc<{ signature: string; slot: number; err: unknown; blockTime: number | null; confirmationStatus: string | null; memo: string | null }[]>(
    rpcUrl,
    "getSignaturesForAddress",
    [address, { limit }],
  );
}

export async function fetchBalanceLamports(rpcUrl: string, address: string) {
  const r = await rpc<{ value: number }>(rpcUrl, "getBalance", [address, { commitment: "confirmed" }]);
  return r.value;
}

export async function fetchTokenAccounts(rpcUrl: string, owner: string) {
  const r = await rpc<{
    value: { pubkey: string; account: { data: { parsed: { info: { mint: string; tokenAmount: { uiAmount: number | null; amount: string; decimals: number } } } } } }[];
  }>(rpcUrl, "getTokenAccountsByOwner", [owner, { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" }, { encoding: "jsonParsed" }]);
  return r.value.map((v) => ({ account: v.pubkey, mint: v.account.data.parsed.info.mint, amount: v.account.data.parsed.info.tokenAmount }));
}

export async function fetchTokenBalance(rpcUrl: string, tokenAccount: string) {
  const r = await rpc<{ value: { uiAmount: number | null; amount: string; decimals: number } }>(rpcUrl, "getTokenAccountBalance", [tokenAccount]);
  return r.value;
}
