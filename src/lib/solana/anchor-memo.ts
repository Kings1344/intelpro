/**
 * Criteria anchoring: the SHA-256 of the approved criteria (canonical JSON) is
 * written to Solana via the SPL Memo program, giving a tamper-evident public
 * timestamp of the rules traders agreed to. Pure module (Web Crypto) — unit tested.
 */
export type AnchorableCriteria = {
  marketId: string;
  version: number;
  improvedQuestion: string;
  yesCondition: string;
  noCondition: string;
  resolutionDeadline: string;
  timezone: string;
  dataSource: string;
  methodology: string;
};

export function canonicalCriteria(c: AnchorableCriteria): string {
  const ordered: Record<string, string | number> = {};
  for (const k of Object.keys(c).sort() as (keyof AnchorableCriteria)[]) ordered[k] = typeof c[k] === "string" ? (c[k] as string).trim() : c[k];
  return JSON.stringify(ordered);
}

export async function criteriaHash(c: AnchorableCriteria): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalCriteria(c)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const MEMO_PREFIX = "intelpro:v1:criteria";

export function anchorMemo(marketId: string, version: number, hash: string) {
  return `${MEMO_PREFIX}:${marketId}:${version}:${hash}`;
}

export function parseAnchorMemo(memo: string): { marketId: string; version: number; hash: string } | null {
  // jsonParsed memo instructions may be prefixed with "[<len>] " by some RPCs.
  const m = memo.replace(/^\[\d+\]\s*/, "").match(/^intelpro:v1:criteria:([a-z0-9]+):(\d+):([0-9a-f]{64})$/);
  return m ? { marketId: m[1], version: Number(m[2]), hash: m[3] } : null;
}
