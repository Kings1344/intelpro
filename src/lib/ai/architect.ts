import "server-only";
import { generateStructured, AiUnavailableError } from "./provider";
import { architectOutput } from "./schemas";
import { heuristicArchitect, ruleChecks } from "./heuristics";
import type { ArchitectResult, Issue } from "./types";

const SYSTEM = `You are IntelPro's Market Architect, a specialist in writing unambiguous, objectively resolvable binary prediction-market rules.
You analyse ONLY the question you are given. Point to the exact words that cause each problem.
Never invent facts about the world (prices, results, dates of events). You may recommend widely known authoritative data sources, but if you are not certain a specific URL exists, set dataSourceUrl to null.
Respond with a single JSON object and nothing else.`;

function prompt(question: string, preChecks: Issue[], nowIso: string) {
  return `Current date-time (UTC): ${nowIso}

Submitted market question:
"""${question}"""

Deterministic pre-checks already found (confirm, refine, or add to these; do not drop a real problem):
${preChecks.length ? preChecks.map((i) => `- [${i.severity}] ${i.code}: ${i.message}`).join("\n") : "- none"}

Analyse the question for: ambiguous wording, unclear deadlines, missing resolution conditions, undefined data sources, subjective language, potential disputes, inconsistent outcome definitions.

Return JSON with exactly these keys:
{
  "issues": [{ "code": "UPPER_SNAKE_CASE", "severity": "critical|major|minor", "message": "explain the problem citing the exact words", "excerpt": "exact words from the question" }],
  "improvedQuestion": "one binary question with absolute deadline incl. time and timezone, a named data source and an objective threshold",
  "yesCondition": "precise condition for YES",
  "noCondition": "precise condition for NO (must be the logical complement of YES)",
  "resolutionDeadline": "ISO-8601 UTC date-time",
  "timezone": "UTC",
  "dataSource": "named authoritative source",
  "dataSourceUrl": "https URL or null",
  "methodology": "numbered steps a neutral resolver follows, including a fallback source",
  "clarityScore": 0-100 integer score for the ORIGINAL question (100 = unambiguous),
  "scoreRationale": "why the original received this score",
  "potentialDisputes": ["concrete dispute scenarios the original wording invites"]
}`;
}

export async function analyseQuestion(question: string, now = new Date()): Promise<ArchitectResult> {
  const pre = ruleChecks(question, now);
  try {
    const { data, model } = await generateStructured({
      task: "architect",
      system: SYSTEM,
      prompt: prompt(question, pre, now.toISOString()),
      schema: architectOutput,
      maxTokens: 2500,
    });
    const codes = new Set(data.issues.map((i) => i.code));
    const merged: Issue[] = [...data.issues, ...pre.filter((i) => !codes.has(i.code))];
    return {
      originalQuestion: question,
      improvedQuestion: data.improvedQuestion,
      yesCondition: data.yesCondition,
      noCondition: data.noCondition,
      resolutionDeadline: new Date(data.resolutionDeadline).toISOString(),
      timezone: data.timezone,
      dataSource: data.dataSource,
      dataSourceUrl: data.dataSourceUrl,
      methodology: data.methodology,
      clarityScore: data.clarityScore,
      scoreRationale: data.scoreRationale,
      issues: merged,
      potentialDisputes: data.potentialDisputes,
      engine: "AI",
      model,
      aiError: null,
    };
  } catch (e) {
    const fallback = heuristicArchitect(question, now);
    fallback.aiError = e instanceof AiUnavailableError ? e.message : "AI analysis failed unexpectedly.";
    return fallback;
  }
}
