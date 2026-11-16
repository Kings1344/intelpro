import { test } from "node:test";
import assert from "node:assert/strict";
import { enforceTraceability, groundClaims } from "../src/lib/ai/traceability";
import { ruleRecommendation, tally, type WeighableEvidence } from "../src/lib/ai/resolution-rules";

const e = (id: string, stance: WeighableEvidence["stance"], o: Partial<WeighableEvidence> = {}): WeighableEvidence => ({ id, title: id, category: "MARKET_DATA", accessible: true, stance, relevance: 0.9, status: "ANALYSED", ...o });

test("citations of non-existent evidence are discarded", () => {
  const v = enforceTraceability(
    { recommendation: "NO_SUPPORTED", confidence: 0.8, reasoning: "Because ev1 and ev2.", uncertainty: "Some.", missingInformation: [], citedEvidenceIds: ["ev1", "invented-123", "ev1"] },
    [{ id: "ev1", stance: "SUPPORTS_NO", accessible: true }],
  );
  assert.deepEqual(v.citedEvidenceIds, ["ev1"]);
  assert.deepEqual(v.rejectedCitations, ["invented-123"]);
  assert.equal(v.recommendation, "NO_SUPPORTED");
  assert.equal(v.downgraded, false);
});

test("a YES/NO recommendation without matching accessible evidence is downgraded", () => {
  const refs = [{ id: "a", stance: "SUPPORTS_NO" as const, accessible: true }, { id: "b", stance: "SUPPORTS_YES" as const, accessible: false }];
  const v = enforceTraceability({ recommendation: "YES_SUPPORTED", confidence: 0.9, reasoning: "x".repeat(20), uncertainty: "y".repeat(10), missingInformation: [], citedEvidenceIds: ["a", "b", "ghost"] }, refs);
  assert.equal(v.recommendation, "INCONCLUSIVE");
  assert.equal(v.downgraded, true);
  assert.ok(v.confidence <= 0.3);
  assert.deepEqual(v.rejectedCitations, ["ghost"]);
});

test("ungrounded claims are removed", () => {
  const { claims, dropped } = groundClaims(
    { summary: "s".repeat(10), stance: "SUPPORTS_NO", relevance: 0.8, reasoning: "r".repeat(10), claims: [{ text: "real", supports: "NO", quote: "closed at $4,612 on the day" }, { text: "made up", supports: "YES", quote: "closed at $5,200 on the day" }] },
    "ETH closed at $4,612 on the day of expiry.",
  );
  assert.equal(claims.length, 1);
  assert.equal(dropped, 1);
});

test("rules engine: insufficient, inconclusive, supported", () => {
  assert.equal(ruleRecommendation([], { deadlinePassed: true, dataSource: "X" }).recommendation, "INSUFFICIENT_EVIDENCE");
  assert.equal(ruleRecommendation([e("a", "SUPPORTS_YES", { category: "SOCIAL_MEDIA" })], { deadlinePassed: true, dataSource: "X" }).recommendation, "INSUFFICIENT_EVIDENCE");
  assert.equal(ruleRecommendation([e("a", "SUPPORTS_YES"), e("b", "SUPPORTS_NO")], { deadlinePassed: true, dataSource: "X" }).recommendation, "INCONCLUSIVE");
  const r = ruleRecommendation([e("a", "SUPPORTS_NO"), e("b", "SUPPORTS_NO"), e("c", "SUPPORTS_YES", { category: "NEWS_REPORT", relevance: 0.5 })], { deadlinePassed: true, dataSource: "X" });
  assert.equal(r.recommendation, "NO_SUPPORTED");
  assert.deepEqual(r.citedEvidenceIds, ["a", "b"]);
  assert.ok(r.confidence > 0.5 && r.confidence <= 0.95);
});

test("inaccessible evidence carries no weight and is reported as missing", () => {
  const r = ruleRecommendation([e("a", "SUPPORTS_YES", { accessible: false }), e("b", "SUPPORTS_YES", { accessible: false })], { deadlinePassed: true, dataSource: "X" });
  assert.equal(r.recommendation, "INSUFFICIENT_EVIDENCE");
  assert.ok(r.missingInformation.some((m) => /could not be retrieved/.test(m)));
  assert.deepEqual(tally([e("a", "SUPPORTS_YES", { accessible: false })]).inaccessibleIds, ["a"]);
});

test("confidence is reduced before the deadline", () => {
  const ev = [e("a", "SUPPORTS_NO"), e("b", "SUPPORTS_NO")];
  const before = ruleRecommendation(ev, { deadlinePassed: false, dataSource: "X" });
  const after = ruleRecommendation(ev, { deadlinePassed: true, dataSource: "X" });
  assert.ok(before.confidence < after.confidence);
  assert.ok(before.missingInformation.some((m) => /deadline has not passed/.test(m)));
});
