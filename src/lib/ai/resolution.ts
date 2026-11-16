import "server-only";
import { generateStructured, AiUnavailableError } from "./provider";
import { resolutionOutput } from "./schemas";
import { enforceTraceability } from "./traceability";
import { ruleRecommendation, tally, type WeighableEvidence } from "./resolution-rules";
import type { Engine } from "./types";

export type ResolutionEvidence = WeighableEvidence & {
  sourceName: string;
  sourceUrl: string | null;
  publishedAt: string | null;
  summary: string | null;
  claims: { text: string; supports: string }[];
};

export type ResolutionResult = {
  recommendation: "YES_SUPPORTED" | "NO_SUPPORTED" | "INCONCLUSIVE" | "INSUFFICIENT_EVIDENCE";
  confidence: number;
  reasoning: string;
  uncertainty: string;
  missingInformation: string[];
  citedEvidenceIds: string[];
  rejectedCitations: string[];
  engine: Engine;
  model: string | null;
  aiError: string | null;
};

const SYSTEM = `You are IntelPro's resolution analyst. You evaluate stored evidence records against a prediction market's approved criteria and recommend an outcome.
Hard rules:
- Use ONLY the evidence records provided. Never introduce facts, sources or citations that are not in the list.
- Cite records only by their exact "id". Unknown IDs are discarded and a recommendation without valid supporting citations is downgraded.
- Records marked accessible=false could not be retrieved: their claims are unverified and must not support a recommendation.
- If the deadline has not passed, say so and lower confidence.
- Your output is an advisory recommendation, NOT a settlement.
Respond with a single JSON object only.`;

export async function recommendResolution(input: {
  criteria: { improvedQuestion: string; yesCondition: string; noCondition: string; resolutionDeadline: string; dataSource: string; methodology: string };
  evidence: ResolutionEvidence[];
  now?: Date;
}): Promise<ResolutionResult> {
  const now = input.now ?? new Date();
  const deadlinePassed = new Date(input.criteria.resolutionDeadline).getTime() <= now.getTime();
  const rule = ruleRecommendation(input.evidence, { deadlinePassed, dataSource: input.criteria.dataSource });
  const refs = input.evidence.map((e) => ({ id: e.id, stance: e.stance, accessible: e.accessible }));

  if (input.evidence.length === 0) {
    return { ...rule, rejectedCitations: [], engine: "HEURISTIC", model: null, aiError: null };
  }

  try {
    const t = tally(input.evidence);
    const { data, model } = await generateStructured({
      task: "resolution",
      system: SYSTEM,
      schema: resolutionOutput,
      maxTokens: 2200,
      prompt: `NOW (UTC): ${now.toISOString()} — deadline ${deadlinePassed ? "HAS PASSED" : "has NOT passed"}

APPROVED CRITERIA
Question: ${input.criteria.improvedQuestion}
YES if: ${input.criteria.yesCondition}
NO if: ${input.criteria.noCondition}
Deadline: ${input.criteria.resolutionDeadline}
Designated data source: ${input.criteria.dataSource}
Methodology: ${input.criteria.methodology}

DETERMINISTIC TALLY (for reference): YES weight ${t.yesWeight.toFixed(2)}, NO weight ${t.noWeight.toFixed(2)}, inaccessible ${t.inaccessibleIds.length}

EVIDENCE RECORDS (JSON)
${JSON.stringify(
  input.evidence.map((e) => ({
    id: e.id,
    title: e.title,
    source: e.sourceName,
    url: e.sourceUrl,
    category: e.category,
    published: e.publishedAt,
    accessible: e.accessible,
    status: e.status,
    analysedStance: e.stance,
    relevance: e.relevance,
    summary: e.summary,
    groundedClaims: e.claims,
  })),
  null,
  1,
)}

Return JSON: { "recommendation": "YES_SUPPORTED|NO_SUPPORTED|INCONCLUSIVE|INSUFFICIENT_EVIDENCE", "confidence": 0..1, "reasoning": "step-by-step, referencing record ids", "uncertainty": "what could make this wrong", "missingInformation": ["..."], "citedEvidenceIds": ["ids from the list above"] }`,
    });
    const v = enforceTraceability(data, refs);
    return {
      recommendation: v.recommendation,
      confidence: v.confidence,
      reasoning: v.downgradeReason ? `${v.reasoning}\n\n[IntelPro] ${v.downgradeReason}` : v.reasoning,
      uncertainty: v.uncertainty,
      missingInformation: v.missingInformation,
      citedEvidenceIds: v.citedEvidenceIds,
      rejectedCitations: v.rejectedCitations,
      engine: "AI",
      model,
      aiError: null,
    };
  } catch (e) {
    const v = enforceTraceability(rule, refs);
    return {
      ...rule,
      recommendation: v.recommendation,
      citedEvidenceIds: v.citedEvidenceIds,
      rejectedCitations: [],
      engine: "HEURISTIC",
      model: null,
      aiError: e instanceof AiUnavailableError ? e.message : "AI analysis failed unexpectedly.",
    };
  }
}
