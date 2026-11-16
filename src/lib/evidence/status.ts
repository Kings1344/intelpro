/**
 * Evidence verification states. Pure module.
 *
 * SUBMITTED         — recorded, nothing checked yet.
 * ACCESSIBLE        — the source URL was retrieved successfully; not yet analysed.
 * UNABLE_TO_VERIFY  — retrieval failed (HTTP error, timeout, blocked, unsupported content).
 * ANALYSED          — content was compared against the market criteria.
 * CORROBORATED      — analysed, and an independent source (different domain) reaches the same stance, with no conflict.
 * CONTRADICTED      — analysed, and at least one other analysed source reaches the opposite stance.
 */
export type EvidenceStatus = "SUBMITTED" | "ACCESSIBLE" | "ANALYSED" | "CORROBORATED" | "CONTRADICTED" | "UNABLE_TO_VERIFY";
export type Stance = "SUPPORTS_YES" | "SUPPORTS_NO" | "NEUTRAL" | "UNCLASSIFIED";

export type EvidenceForStatus = {
  id: string;
  /** URL, or for uploaded PDFs a stable publisher key such as "pdf:<source name>". */
  sourceUrl: string;
  status: EvidenceStatus;
  /** Stance from the latest analysis (not the submitter's claim). */
  analysedStance: Stance | null;
};

function domain(url: string) {
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    const parts = h.split(".");
    return parts.slice(-2).join(".");
  } catch {
    return url;
  }
}

const directional = (s: Stance | null): s is "SUPPORTS_YES" | "SUPPORTS_NO" => s === "SUPPORTS_YES" || s === "SUPPORTS_NO";
const opposite = (s: "SUPPORTS_YES" | "SUPPORTS_NO") => (s === "SUPPORTS_YES" ? "SUPPORTS_NO" : "SUPPORTS_YES");

/** Recomputes cross-evidence statuses for one market. Returns only the rows whose status changed. */
export function deriveStatuses(items: EvidenceForStatus[]): { id: string; status: EvidenceStatus }[] {
  const analysed = items.filter((e) => ["ANALYSED", "CORROBORATED", "CONTRADICTED"].includes(e.status));
  const changes: { id: string; status: EvidenceStatus }[] = [];
  for (const e of analysed) {
    let next: EvidenceStatus = "ANALYSED";
    if (directional(e.analysedStance)) {
      const stance = e.analysedStance;
      const others = analysed.filter((o) => o.id !== e.id);
      const conflict = others.some((o) => o.analysedStance === opposite(stance));
      const independentAgreement = others.some((o) => o.analysedStance === stance && domain(o.sourceUrl) !== domain(e.sourceUrl));
      next = conflict ? "CONTRADICTED" : independentAgreement ? "CORROBORATED" : "ANALYSED";
    }
    if (next !== e.status) changes.push({ id: e.id, status: next });
  }
  return changes;
}

export const STATUS_DESCRIPTIONS: Record<EvidenceStatus, string> = {
  SUBMITTED: "Recorded. The source has not been checked yet.",
  ACCESSIBLE: "Source retrieved successfully. Content not yet analysed.",
  ANALYSED: "Content compared against the approved resolution criteria.",
  CORROBORATED: "An independent source (different domain) reaches the same conclusion.",
  CONTRADICTED: "Another analysed source reaches the opposite conclusion.",
  UNABLE_TO_VERIFY: "The source could not be retrieved, so its claims are unverified.",
};
