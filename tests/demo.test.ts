/**
 * Runs the demonstration dataset through the same engines the seed uses, so the
 * three-minute demo story is guaranteed by tests rather than by hand-written values.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEMO_MARKETS } from "../src/lib/demo/data";
import { heuristicArchitect, ruleChecks, scoreFromIssues } from "../src/lib/ai/heuristics";
import { deriveStatuses } from "../src/lib/evidence/status";
import { ruleRecommendation } from "../src/lib/ai/resolution-rules";
import { evaluateIntegrity } from "../src/lib/integrity/rules";

const NOW = new Date("2026-11-16T12:00:00Z");

function simulate(key: string) {
  const dm = DEMO_MARKETS.find((m) => m.key === key)!;
  const deadline = dm.fixedDeadline ? new Date(dm.fixedDeadline) : new Date(NOW.getTime() + (dm.deadlineDaysFromNow ?? 0) * 86400e3);
  const v1 = heuristicArchitect(dm.question, new Date(NOW.getTime() - 20 * 86400e3));
  const ev = dm.evidence.map((e, i) => ({ id: `e${i}`, ...e, status: (!e.accessible ? "UNABLE_TO_VERIFY" : e.analysis ? "ANALYSED" : "ACCESSIBLE") as never as string, stance: e.analysis?.stance ?? null }));
  for (const c of deriveStatuses(ev.map((e) => ({ id: e.id, sourceUrl: e.sourceUrl, status: e.status as never, analysedStance: e.stance })))) ev.find((e) => e.id === c.id)!.status = c.status;
  const rec = dm.generateRecommendation
    ? ruleRecommendation(ev.map((e) => ({ id: e.id, title: e.title, category: e.category, accessible: e.accessible, stance: e.stance, relevance: e.analysis?.relevance ?? 0, status: e.status })), { deadlinePassed: deadline <= NOW, dataSource: dm.approvedCriteria!.dataSource })
    : null;
  const criteria = dm.approvedCriteria
    ? { approved: true, clarityScore: scoreFromIssues(ruleChecks(dm.approvedCriteria.improvedQuestion, NOW)).score, dataSource: dm.approvedCriteria.dataSource, resolutionDeadline: deadline, issues: [] }
    : { approved: false, clarityScore: v1.clarityScore, dataSource: v1.dataSource, resolutionDeadline: deadline, issues: v1.issues };
  const integrity = evaluateIntegrity({ status: dm.status, question: dm.question, resolutionDeadline: deadline, criteria, evidence: ev, openDisputes: dm.dispute ? 1 : 0, hasRecommendation: !!rec, now: NOW });
  return { dm, v1, ev, rec, integrity, criteria };
}

test("flagship BTC demo: ambiguity found, rules repaired, conflict surfaced, NO supported, under dispute", () => {
  const s = simulate("btc150");
  assert.ok(s.v1.clarityScore < 70);
  assert.ok(s.criteria.clarityScore >= 85, `approved rules score ${s.criteria.clarityScore}`);
  assert.ok(s.ev.some((e) => e.status === "CONTRADICTED"), "news report conflicts with market data");
  assert.ok(s.ev.some((e) => e.status === "UNABLE_TO_VERIFY"), "social post unreachable");
  assert.equal(s.rec!.recommendation, "NO_SUPPORTED");
  assert.ok(s.rec!.missingInformation.some((m) => /deadline has not passed/.test(m)));
  assert.ok(!s.rec!.citedEvidenceIds.includes("e3"), "unreachable source is not cited");
  assert.equal(s.integrity.status, "UNDER_DISPUTE");
});

test("other demo markets cover every integrity status", () => {
  assert.equal(simulate("eth5k").integrity.status, "HEALTHY");
  assert.equal(simulate("eth5k").rec!.recommendation, "NO_SUPPORTED");
  assert.equal(simulate("fed").integrity.status, "NEEDS_ATTENTION");
  assert.equal(simulate("sol400").integrity.status, "NEEDS_ATTENTION");
  assert.equal(simulate("ai-model").integrity.status, "HIGH_RISK");
});

test("demo data is clearly labelled and uses reserved example domains only", () => {
  for (const m of DEMO_MARKETS)
    for (const e of [...m.evidence, ...(m.dispute?.evidence ?? [])]) {
      assert.match(new URL(e.sourceUrl).hostname, /(^|\.)example\.(com|net|org)$/, e.sourceUrl);
      assert.match(e.title, /^\[Demo\]/);
      assert.match(e.title + e.description, /illustrative/i);
      if (e.analysis) assert.match(e.analysis.summary, /not AI output/);
    }
});
