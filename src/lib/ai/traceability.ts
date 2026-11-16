/**
 * Guards that keep AI output traceable to stored records. Pure module — unit tested.
 */
import { quoteAppearsIn } from "../evidence/text";
import type { ResolutionOutput, EvidenceOutput } from "./schemas";

export type EvidenceRef = { id: string; stance: "SUPPORTS_YES" | "SUPPORTS_NO" | "NEUTRAL" | "UNCLASSIFIED" | null; accessible: boolean };

export type ValidatedResolution = ResolutionOutput & { rejectedCitations: string[]; downgraded: boolean; downgradeReason: string | null };

/**
 * 1. Drops any cited ID that is not an evidence record of this market.
 * 2. A YES/NO recommendation must be backed by at least one valid citation of an
 *    accessible record whose analysed stance points the same way; otherwise it is
 *    downgraded to INCONCLUSIVE.
 */
export function enforceTraceability(out: ResolutionOutput, evidence: EvidenceRef[]): ValidatedResolution {
  const byId = new Map(evidence.map((e) => [e.id, e]));
  const valid = [...new Set(out.citedEvidenceIds)].filter((id) => byId.has(id));
  const rejected = [...new Set(out.citedEvidenceIds)].filter((id) => !byId.has(id));

  let recommendation = out.recommendation;
  let downgraded = false;
  let downgradeReason: string | null = null;

  if (recommendation === "YES_SUPPORTED" || recommendation === "NO_SUPPORTED") {
    const needed = recommendation === "YES_SUPPORTED" ? "SUPPORTS_YES" : "SUPPORTS_NO";
    const backing = valid.filter((id) => byId.get(id)!.stance === needed && byId.get(id)!.accessible);
    if (backing.length === 0) {
      recommendation = "INCONCLUSIVE";
      downgraded = true;
      downgradeReason = `The model recommended ${out.recommendation} but cited no accessible stored evidence analysed as ${needed}. Downgraded to INCONCLUSIVE.`;
    }
  }
  return {
    ...out,
    recommendation,
    confidence: downgraded ? Math.min(out.confidence, 0.3) : out.confidence,
    citedEvidenceIds: valid,
    rejectedCitations: rejected,
    downgraded,
    downgradeReason,
  };
}

/** Keeps only extracted claims whose supporting quote literally appears in the retrieved source text. */
export function groundClaims(out: EvidenceOutput, sourceText: string): { claims: EvidenceOutput["claims"]; dropped: number } {
  const claims = out.claims.filter((c) => quoteAppearsIn(c.quote, sourceText));
  return { claims, dropped: out.claims.length - claims.length };
}
