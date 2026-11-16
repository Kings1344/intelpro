import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateIntegrity, RULES, type IntegrityInput } from "../src/lib/integrity/rules";

const NOW = new Date("2026-11-16T12:00:00Z");
const day = 86400e3;
const healthyCriteria = { approved: true, clarityScore: 92, dataSource: "CoinGecko", resolutionDeadline: new Date(NOW.getTime() + 30 * day), issues: [] };
const base = (o: Partial<IntegrityInput> = {}): IntegrityInput => ({
  status: "ACTIVE",
  question: "q",
  resolutionDeadline: new Date(NOW.getTime() + 30 * day),
  criteria: healthyCriteria,
  evidence: [{ status: "ANALYSED" }],
  openDisputes: 0,
  hasRecommendation: false,
  now: NOW,
  ...o,
});

test("healthy market has no findings", () => {
  const r = evaluateIntegrity(base());
  assert.equal(r.status, "HEALTHY");
  assert.deepEqual(r.findings, []);
});

test("live market without approved criteria is high risk; a draft only needs attention", () => {
  assert.equal(evaluateIntegrity(base({ criteria: null })).status, "HIGH_RISK");
  assert.equal(evaluateIntegrity(base({ status: "DRAFT", criteria: { ...healthyCriteria, approved: false } })).status, "NEEDS_ATTENTION");
});

test("clarity thresholds", () => {
  assert.equal(evaluateIntegrity(base({ criteria: { ...healthyCriteria, clarityScore: 45 } })).status, "HIGH_RISK");
  assert.equal(evaluateIntegrity(base({ criteria: { ...healthyCriteria, clarityScore: 65 } })).status, "NEEDS_ATTENTION");
});

test("conflicting evidence escalates after the deadline", () => {
  const before = evaluateIntegrity(base({ evidence: [{ status: "CONTRADICTED" }, { status: "CONTRADICTED" }] }));
  assert.equal(before.status, "NEEDS_ATTENTION");
  assert.ok(before.findings.some((f) => f.rule === RULES.CONFLICTING_EVIDENCE));
  const past = new Date(NOW.getTime() - day);
  const after = evaluateIntegrity(base({ resolutionDeadline: past, criteria: { ...healthyCriteria, resolutionDeadline: past }, evidence: [{ status: "CONTRADICTED" }], hasRecommendation: true }));
  assert.equal(after.status, "HIGH_RISK");
});

test("unavailable sources, approaching and passed deadlines", () => {
  assert.ok(evaluateIntegrity(base({ evidence: [{ status: "UNABLE_TO_VERIFY" }, { status: "ANALYSED" }] })).findings.some((f) => f.rule === RULES.UNAVAILABLE_SOURCES));
  const soon = new Date(NOW.getTime() + 2 * day);
  const r = evaluateIntegrity(base({ resolutionDeadline: soon, criteria: { ...healthyCriteria, resolutionDeadline: soon }, evidence: [] }));
  assert.ok(r.findings.some((f) => f.rule === RULES.DEADLINE_APPROACHING));
  const past = new Date(NOW.getTime() - day);
  assert.equal(evaluateIntegrity(base({ resolutionDeadline: past, criteria: { ...healthyCriteria, resolutionDeadline: past } })).status, "HIGH_RISK");
});

test("open dispute overrides everything", () => {
  assert.equal(evaluateIntegrity(base({ openDisputes: 1, criteria: null })).status, "UNDER_DISPUTE");
});

test("inconsistent deadlines are flagged, including against the PREDICT on-chain end time", () => {
  const r = evaluateIntegrity(base({ resolutionDeadline: new Date(NOW.getTime() + 40 * day) }));
  assert.ok(r.findings.some((f) => f.rule === RULES.INCONSISTENT_DEADLINE));
  const p = evaluateIntegrity(base({ predictEndTs: new Date(NOW.getTime() + 31 * day) }));
  assert.ok(p.findings.some((f) => /PREDICT/.test(f.message)));
});
