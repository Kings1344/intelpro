import { test } from "node:test";
import assert from "node:assert/strict";
import { heuristicArchitect, ruleChecks, validateCriteria, blocksApproval, parseDeadline, scoreFromIssues } from "../src/lib/ai/heuristics";
import { architectOutput } from "../src/lib/ai/schemas";
import { extractJson } from "../src/lib/ai/json";

const NOW = new Date("2026-11-16T12:00:00Z");
const codes = (q: string) => ruleChecks(q, NOW).map((i) => i.code);

test("BTC example: flags the weaknesses named in the brief", () => {
  const r = heuristicArchitect("Will Bitcoin reach $150,000 before December 31, 2026?", NOW);
  const c = r.issues.map((i) => i.code);
  assert.ok(c.includes("DATA_SOURCE_UNDEFINED"), "undefined data source");
  assert.ok(c.includes("MEASUREMENT_AMBIGUOUS"), "'reach $150,000' needs a precise index");
  assert.ok(c.includes("TIMEZONE_MISSING"), "deadline timezone missing");
  assert.ok(r.issues.find((i) => i.code === "MEASUREMENT_AMBIGUOUS")!.excerpt!.includes("$150,000"), "cites the exact phrase");
  assert.ok(r.clarityScore > 0 && r.clarityScore < 70);
  assert.equal(r.engine, "HEURISTIC");
  assert.match(r.improvedQuestion, /BTC\/USD/);
  assert.match(r.improvedQuestion, /23:59:59 UTC on December 31, 2026/);
  assert.equal(r.resolutionDeadline, "2026-12-31T23:59:59.000Z");
  assert.ok(r.dataSource.length > 0);
});

test("score rationale is consistent with the issues", () => {
  const issues = ruleChecks("Will Bitcoin reach $150,000 before December 31, 2026?", NOW);
  const { score, rationale } = scoreFromIssues(issues);
  assert.match(rationale, new RegExp(`Final: ${score}/100`));
});

test("a well-specified question scores high and gets no critical issue", () => {
  const q = "Will the BTC/USD price published by CoinGecko reach or exceed $150,000 at any time before 23:59 UTC on December 31, 2026?";
  const issues = ruleChecks(q, NOW);
  assert.ok(!issues.some((i) => i.severity === "critical"), JSON.stringify(issues));
  assert.ok(scoreFromIssues(issues).score >= 85);
});

test("detects relative deadlines, subjective language and missing deadline", () => {
  assert.ok(codes("Will the Fed significantly cut rates soon?").includes("DEADLINE_RELATIVE"));
  assert.ok(codes("Will the Fed significantly cut rates soon?").includes("SUBJECTIVE_LANGUAGE"));
  assert.ok(codes("Will a new popular phone be launched by Apple?").includes("DEADLINE_MISSING"));
  assert.ok(codes("Will a new phone launch on March 3, 2025?").includes("DEADLINE_IN_PAST"));
});

test("parses common deadline formats", () => {
  assert.equal(parseDeadline("by 2027-03-01")!.date.toISOString(), "2027-03-01T23:59:59.000Z");
  assert.equal(parseDeadline("before 1 March 2027")!.date.toISOString(), "2027-03-01T23:59:59.000Z");
  assert.equal(parseDeadline("on Mar. 1, 2027 at 12:00 UTC")!.hasTimezone, true);
  assert.equal(parseDeadline("by end of 2027")!.date.toISOString(), "2027-12-31T23:59:59.000Z");
  assert.equal(parseDeadline("February 30, 2027"), null, "invalid calendar date is rejected");
});

test("validateCriteria catches inconsistent outcome definitions", () => {
  const base = {
    improvedQuestion: "Will the BTC/USD price published by CoinGecko reach $150,000 before 23:59 UTC on December 31, 2026?",
    yesCondition: "Resolves YES if CoinGecko records BTC/USD at or above $150,000 before the deadline.",
    noCondition: "Resolves NO if CoinGecko does not record BTC/USD at or above $150,000 before the deadline.",
    resolutionDeadline: "2026-12-31T23:59:00.000Z",
    dataSource: "CoinGecko BTC/USD",
    methodology: "Check CoinGecko history after the deadline.",
  };
  assert.deepEqual(validateCriteria(base, NOW), []);
  const wrongAmount = validateCriteria({ ...base, noCondition: "Resolves NO if BTC stays below $140,000." }, NOW);
  assert.ok(wrongAmount.some((i) => i.code === "OUTCOMES_INCONSISTENT" && i.severity === "critical"));
  assert.ok(blocksApproval(wrongAmount));
  assert.ok(blocksApproval(validateCriteria({ ...base, noCondition: base.yesCondition }, NOW)));
  assert.ok(blocksApproval(validateCriteria({ ...base, dataSource: "" }, NOW)));
  assert.ok(validateCriteria({ ...base, resolutionDeadline: "2027-06-30T00:00:00Z" }, NOW).some((i) => i.code === "DEADLINE_INCONSISTENT"));
  assert.ok(blocksApproval(validateCriteria({ ...base, resolutionDeadline: "2026-01-01T00:00:00Z" }, NOW)));
});

test("AI output schema rejects malformed responses", () => {
  const good = {
    issues: [{ code: "DATA_SOURCE_UNDEFINED", severity: "critical", message: "No source is named.", excerpt: "reach" }],
    improvedQuestion: "Will X happen by 23:59 UTC on 31 Dec 2026 per Source?",
    yesCondition: "YES if Source confirms X.",
    noCondition: "NO if Source does not confirm X.",
    resolutionDeadline: "2026-12-31T23:59:00Z",
    timezone: "UTC",
    dataSource: "Source",
    dataSourceUrl: null,
    methodology: "1. Check the source after the deadline.",
    clarityScore: 61,
    scoreRationale: "Missing a source and a time.",
    potentialDisputes: [],
  };
  assert.equal(architectOutput.safeParse(good).success, true);
  assert.equal(architectOutput.safeParse({ ...good, clarityScore: 140 }).success, false);
  assert.equal(architectOutput.safeParse({ ...good, resolutionDeadline: "next week" }).success, false);
  assert.equal(architectOutput.safeParse({ ...good, issues: [{ ...good.issues[0], severity: "fatal" }] }).success, false);
});

test("extractJson handles fenced and bare JSON, and fails loudly otherwise", () => {
  assert.deepEqual(extractJson('Here you go:\n```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('prefix {"b":[1,2]} suffix'), { b: [1, 2] });
  assert.throws(() => extractJson("no json here"));
});
