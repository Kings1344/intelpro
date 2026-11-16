/**
 * Deterministic evidence-weighting used (a) as context for the AI and (b) as the
 * fallback recommendation engine. Pure module — unit tested.
 */
export type Category =
  | "OFFICIAL_DATA" | "MARKET_DATA" | "ONCHAIN_DATA" | "NEWS_REPORT" | "OFFICIAL_STATEMENT" | "RESEARCH" | "SOCIAL_MEDIA" | "OTHER";

export const CATEGORY_WEIGHT: Record<Category, number> = {
  OFFICIAL_DATA: 1.0,
  MARKET_DATA: 0.9,
  ONCHAIN_DATA: 0.9,
  OFFICIAL_STATEMENT: 0.8,
  RESEARCH: 0.6,
  NEWS_REPORT: 0.6,
  OTHER: 0.3,
  SOCIAL_MEDIA: 0.2,
};

export type WeighableEvidence = {
  id: string;
  title: string;
  category: Category;
  accessible: boolean;
  stance: "SUPPORTS_YES" | "SUPPORTS_NO" | "NEUTRAL" | "UNCLASSIFIED" | null;
  relevance: number;
  status: string;
};

export type Tally = {
  yesWeight: number;
  noWeight: number;
  yesIds: string[];
  noIds: string[];
  neutralIds: string[];
  unclassifiedIds: string[];
  inaccessibleIds: string[];
  quality: number; // 0..1 overall evidence quality
};

export function tally(evidence: WeighableEvidence[]): Tally {
  const t: Tally = { yesWeight: 0, noWeight: 0, yesIds: [], noIds: [], neutralIds: [], unclassifiedIds: [], inaccessibleIds: [], quality: 0 };
  let qualitySum = 0;
  for (const e of evidence) {
    if (!e.accessible) {
      t.inaccessibleIds.push(e.id);
      continue;
    }
    const w = CATEGORY_WEIGHT[e.category] * Math.max(0, Math.min(1, e.relevance));
    qualitySum += CATEGORY_WEIGHT[e.category];
    if (e.stance === "SUPPORTS_YES") { t.yesWeight += w; t.yesIds.push(e.id); }
    else if (e.stance === "SUPPORTS_NO") { t.noWeight += w; t.noIds.push(e.id); }
    else if (e.stance === "NEUTRAL") t.neutralIds.push(e.id);
    else t.unclassifiedIds.push(e.id);
  }
  t.quality = evidence.length ? Math.min(1, qualitySum / Math.max(evidence.length, 3)) : 0;
  return t;
}

export type RuleRecommendation = {
  recommendation: "YES_SUPPORTED" | "NO_SUPPORTED" | "INCONCLUSIVE" | "INSUFFICIENT_EVIDENCE";
  confidence: number;
  reasoning: string;
  uncertainty: string;
  missingInformation: string[];
  citedEvidenceIds: string[];
};

const MIN_WEIGHT = 0.8; // e.g. one highly relevant official/market-data source
const DOMINANCE = 2.0;

export function ruleRecommendation(
  evidence: WeighableEvidence[],
  ctx: { deadlinePassed: boolean; dataSource: string },
): RuleRecommendation {
  const t = tally(evidence);
  const missing: string[] = [];
  if (!ctx.deadlinePassed) missing.push("The resolution deadline has not passed; later information could change the outcome.");
  if (!evidence.some((e) => e.accessible && (e.category === "OFFICIAL_DATA" || e.category === "MARKET_DATA")))
    missing.push(`No accessible evidence from the designated source category (${ctx.dataSource}).`);
  if (t.inaccessibleIds.length) missing.push(`${t.inaccessibleIds.length} submitted source(s) could not be retrieved and were excluded.`);
  if (t.unclassifiedIds.length) missing.push(`${t.unclassifiedIds.length} accessible source(s) have no YES/NO classification yet.`);

  const total = t.yesWeight + t.noWeight;
  const header = `Heuristic engine — not AI. Weighted tally: YES ${t.yesWeight.toFixed(2)} (${t.yesIds.length} source(s)) vs NO ${t.noWeight.toFixed(2)} (${t.noIds.length} source(s)). Weights = category reliability × analysed relevance; inaccessible sources count 0.`;

  if (total < MIN_WEIGHT) {
    return {
      recommendation: "INSUFFICIENT_EVIDENCE",
      confidence: 0,
      reasoning: `${header} Total directional weight ${total.toFixed(2)} is below the minimum of ${MIN_WEIGHT}.`,
      uncertainty: "There is not enough accessible, classified evidence to support either outcome.",
      missingInformation: missing,
      citedEvidenceIds: [...t.yesIds, ...t.noIds],
    };
  }
  const side = t.yesWeight >= t.noWeight ? "YES" : "NO";
  const major = Math.max(t.yesWeight, t.noWeight);
  const minor = Math.min(t.yesWeight, t.noWeight);
  if (minor > 0 && major / minor < DOMINANCE) {
    return {
      recommendation: "INCONCLUSIVE",
      confidence: 0.2,
      reasoning: `${header} Neither side reaches the ${DOMINANCE}× dominance threshold, so the evidence conflicts.`,
      uncertainty: "Credible sources disagree. A reviewer should compare the conflicting records directly against the designated data source.",
      missingInformation: missing,
      citedEvidenceIds: [...t.yesIds, ...t.noIds],
    };
  }
  const confidence = Math.min(0.95, (major / total) * Math.min(1, total / 2) * (ctx.deadlinePassed ? 1 : 0.7));
  return {
    recommendation: side === "YES" ? "YES_SUPPORTED" : "NO_SUPPORTED",
    confidence: Number(confidence.toFixed(2)),
    reasoning: `${header} ${side} dominates.`,
    uncertainty: ctx.deadlinePassed
      ? minor > 0 ? "Some evidence points the other way; review it before proposing a resolution." : "Uncertainty comes mainly from evidence quality and coverage."
      : "The deadline has not passed, so this reflects the evidence so far, not a final outcome.",
    missingInformation: missing,
    citedEvidenceIds: side === "YES" ? t.yesIds : t.noIds,
  };
}
