/**
 * Deterministic market-question analyser ("Heuristic engine").
 *
 * Used (a) as rule-based pre-checks that always run, and (b) as the fallback
 * when no LLM is configured. Results are always labelled engine = "HEURISTIC"
 * so the UI never presents them as AI analysis. Pure module — unit tested.
 */
import type { ArchitectResult, Issue, Severity } from "./types";

const PENALTY: Record<Severity, number> = { critical: 18, major: 10, minor: 4 };

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

const SUBJECTIVE = [
  "significant", "significantly", "substantial", "substantially", "major", "massive", "huge", "popular", "successful",
  "widely", "strong", "strongly", "good", "bad", "best", "worst", "likely", "a lot", "dramatically", "mainstream",
  "meaningful", "notable", "viral", "dominant", "collapse", "moon", "crash",
];

const ASSETS: Record<string, { ticker: string; slug: string }> = {
  bitcoin: { ticker: "BTC", slug: "bitcoin" },
  btc: { ticker: "BTC", slug: "bitcoin" },
  ethereum: { ticker: "ETH", slug: "ethereum" },
  ether: { ticker: "ETH", slug: "ethereum" },
  eth: { ticker: "ETH", slug: "ethereum" },
  solana: { ticker: "SOL", slug: "solana" },
  sol: { ticker: "SOL", slug: "solana" },
};

const SOURCE_HINTS =
  /\b(according to|as reported by|as published by|per the|data from|source:|coingecko|coinmarketcap|coinbase|kraken|binance|bloomberg|reuters|associated press|\bap\b|bls|federal reserve|official|certified|\.gov|index|oracle|pyth|chainlink)\b/i;

export type ParsedDate = { date: Date; text: string; hasTime: boolean; hasTimezone: boolean };

export function parseDeadline(q: string): ParsedDate | null {
  const s = q;
  const patterns: { re: RegExp; build: (m: RegExpMatchArray) => Date | null }[] = [
    { re: /\b(\d{4})-(\d{2})-(\d{2})(?:[ t](\d{2}):(\d{2}))?/i, build: (m) => utc(+m[1], +m[2] - 1, +m[3]) },
    { re: new RegExp(`\\b${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})`, "i"), build: (m) => utc(+m[3], monthIdx(m[1]), +m[2]) },
    { re: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_RE}\\.?,?\\s+(\\d{4})`, "i"), build: (m) => utc(+m[3], monthIdx(m[2]), +m[1]) },
    { re: /\b(?:end of|by|before|in)\s+(20\d{2})\b/i, build: (m) => utc(+m[1], 11, 31) },
  ];
  for (const p of patterns) {
    const m = s.match(p.re);
    if (m) {
      const date = p.build(m);
      if (!date || Number.isNaN(date.getTime())) continue;
      const hasTime = /\b\d{1,2}:\d{2}\b|\b\d{1,2}\s?(am|pm)\b|\bmidnight\b|\bnoon\b/i.test(s);
      const hasTimezone = /\b(utc|gmt|z|et|est|edt|pt|pst|pdt|cet|cest|bst|wat|jst|ist|sgt|aest)\b/i.test(s);
      return { date, text: m[0], hasTime, hasTimezone };
    }
  }
  return null;
}

function utc(y: number, m: number, d: number) {
  const date = new Date(Date.UTC(y, m, d, 23, 59, 59));
  return date.getUTCMonth() === m ? date : null;
}
function monthIdx(name: string) {
  const n = name.toLowerCase().slice(0, 3);
  return MONTHS.findIndex((m) => m.startsWith(n));
}

function detectPrice(q: string) {
  const m = q.match(/\$\s?([\d,]+(?:\.\d+)?)\s?(k|m|b|thousand|million|billion)?\b/i);
  if (!m) return null;
  let n = parseFloat(m[1].replace(/,/g, ""));
  const unit = (m[2] ?? "").toLowerCase();
  if (unit === "k" || unit === "thousand") n *= 1e3;
  if (unit === "m" || unit === "million") n *= 1e6;
  if (unit === "b" || unit === "billion") n *= 1e9;
  return { amount: n, text: m[0].trim() };
}

function detectAsset(q: string) {
  const words = q.toLowerCase().match(/[a-z]+/g) ?? [];
  for (const w of words) if (ASSETS[w]) return ASSETS[w];
  return null;
}

type Domain = "crypto_price" | "macro" | "election" | "sports" | "generic";

function detectDomain(q: string, asset: ReturnType<typeof detectAsset>, price: ReturnType<typeof detectPrice>): Domain {
  const l = q.toLowerCase();
  if (asset && price) return "crypto_price";
  if (/\b(cpi|inflation|interest rates?|fed funds|federal funds|unemployment|gdp|recession|rate cut|rate hike)\b/.test(l) || /\b(fed|fomc|federal reserve)\b.*\brates?\b/.test(l)) return "macro";
  if (/\b(elect|election|president|prime minister|senate|governor|vote|ballot|referendum)\b/.test(l)) return "election";
  if (/\b(championship|world cup|super bowl|finals?|league|premier league|match|tournament|olympic)\b/.test(l)) return "sports";
  return "generic";
}

function recommendSource(domain: Domain, q: string, asset: ReturnType<typeof detectAsset>) {
  const l = q.toLowerCase();
  switch (domain) {
    case "crypto_price":
      return {
        dataSource: `CoinGecko ${asset!.ticker}/USD aggregated price`,
        dataSourceUrl: `https://www.coingecko.com/en/coins/${asset!.slug}`,
        fallback: `the median ${asset!.ticker}/USD spot price on Coinbase, Kraken and Bitstamp at the same timestamp`,
      };
    case "macro":
      if (/cpi|inflation|unemployment/.test(l))
        return { dataSource: "U.S. Bureau of Labor Statistics official release", dataSourceUrl: "https://www.bls.gov", fallback: "the first official release, ignoring later revisions" };
      if (/gdp|recession/.test(l))
        return { dataSource: "U.S. Bureau of Economic Analysis official release", dataSourceUrl: "https://www.bea.gov", fallback: "the advance estimate, ignoring later revisions" };
      return { dataSource: "Federal Reserve FOMC statement", dataSourceUrl: "https://www.federalreserve.gov", fallback: "the official implementation note published the same day" };
    case "election":
      return { dataSource: "Certified results from the relevant official electoral authority", dataSourceUrl: null, fallback: "the consensus call of at least two major news agencies if certification is delayed beyond the deadline" };
    case "sports":
      return { dataSource: "Official result published by the governing league or federation", dataSourceUrl: null, fallback: "the official match report" };
    default:
      return { dataSource: "", dataSourceUrl: null, fallback: "" };
  }
}

function longDate(d: Date) {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** Rule checks over a free-text question. Always runs, with or without an LLM. */
export function ruleChecks(question: string, now = new Date()): Issue[] {
  const q = question.trim();
  const l = q.toLowerCase();
  const issues: Issue[] = [];
  const deadline = parseDeadline(q);
  const price = detectPrice(q);
  const asset = detectAsset(q);

  if (q.length < 25) issues.push({ code: "TOO_SHORT", severity: "major", message: "The question is too short to define an unambiguous event." });
  if (!/^(will|is|does|did|can|has|have|are|was|would|should)\b/i.test(q) || !q.endsWith("?"))
    issues.push({ code: "NOT_BINARY_QUESTION", severity: "minor", message: "Phrase the market as a single yes/no question beginning with “Will …” and ending with “?”." });

  const relative = l.match(/\b(soon|next (week|month|year)|this (week|month|year)|in the near future|eventually|by year[- ]end|end of (the )?year)\b/);
  if (relative && !/\b20\d{2}\b/.test(relative[0]))
    issues.push({ code: "DEADLINE_RELATIVE", severity: "critical", message: `“${relative[0]}” is relative — it depends on when the market is read. Use an absolute date.`, excerpt: relative[0] });

  if (!deadline) {
    if (!relative) issues.push({ code: "DEADLINE_MISSING", severity: "critical", message: "No resolution deadline is stated. Every market needs an absolute date and time." });
  } else {
    if (!deadline.hasTime || !deadline.hasTimezone)
      issues.push({
        code: "TIMEZONE_MISSING",
        severity: "major",
        message: `The deadline “${deadline.text}” has no exact time${deadline.hasTimezone ? "" : " or timezone"}. Traders in different timezones could disagree on when it expires.`,
        excerpt: deadline.text,
      });
    const boundary = l.match(/\b(before|until|till|by)\s+(?=[a-z0-9])/);
    if (boundary)
      issues.push({
        code: "BOUNDARY_AMBIGUOUS",
        severity: "minor",
        message: `“${boundary[1]}” does not say whether the deadline day itself counts. State “on or before 23:59:59 UTC on …”.`,
        excerpt: boundary[0].trim(),
      });
    if (deadline.date.getTime() < now.getTime())
      issues.push({ code: "DEADLINE_IN_PAST", severity: "critical", message: `The deadline ${longDate(deadline.date)} has already passed.` });
  }

  if (!SOURCE_HINTS.test(q))
    issues.push({ code: "DATA_SOURCE_UNDEFINED", severity: "critical", message: "No resolution data source is named. Without one, honest traders can disagree about the outcome." });

  if (price) {
    const verb = l.match(/\b(reach|hit|touch|surpass|exceed|cross|break|top|go above|above|over|below|under|fall to|drop to|dip)\b/);
    if (!/\b(close|closing|daily close|intraday|at any (time|point)|spot|settlement|average|vwap|twap)\b/.test(l))
      issues.push({
        code: "MEASUREMENT_AMBIGUOUS",
        severity: "major",
        message: `“${verb ? `${verb[0]} ` : ""}${price.text}” does not define how the price is measured — intraday tick, 1-minute high, or daily close — nor on which index or exchange.`,
        excerpt: verb ? `${verb[0]} ${price.text}` : price.text,
      });
    if (asset && !/\b(usd|usdt|usdc|\/usd|us dollars?)\b/.test(l))
      issues.push({ code: "QUOTE_CURRENCY_MISSING", severity: "minor", message: `Specify the trading pair (e.g. ${asset.ticker}/USD); prices differ across stablecoin and fiat pairs.` });
  }

  const subjective = SUBJECTIVE.filter((w) => new RegExp(`\\b${w}\\b`, "i").test(l));
  if (subjective.length)
    issues.push({
      code: "SUBJECTIVE_LANGUAGE",
      severity: subjective.length > 1 ? "critical" : "major",
      message: `Subjective wording (${subjective.map((w) => `“${w}”`).join(", ")}) cannot be measured. Replace it with an objective threshold.`,
      excerpt: subjective.join(", "),
    });

  if (/\b(and|or)\b/.test(l.replace(/\b(between|both)\b.*?\band\b/, "")) && /\b(will|and will|or will)\b/.test(l)) {
    const joined = l.match(/\b(\w+\s+){0,3}(and|or)\s+(\w+\s*){0,3}/);
    if (joined && /\b(and|or)\s+(will|the|a|an|[a-z]+s)\b/.test(joined[0]))
      issues.push({ code: "COMPOUND_CONDITION", severity: "major", message: "The question may combine several conditions. Split it into separate markets or define how partial outcomes resolve.", excerpt: joined[0].trim() });
  }

  return dedupe(issues);
}

function dedupe(issues: Issue[]) {
  const seen = new Set<string>();
  return issues.filter((i) => (seen.has(i.code) ? false : (seen.add(i.code), true)));
}

export function scoreFromIssues(issues: Issue[]) {
  let score = 100;
  const parts: string[] = [];
  for (const i of issues) {
    score -= PENALTY[i.severity];
    parts.push(`−${PENALTY[i.severity]} ${i.code.toLowerCase().replace(/_/g, " ")} (${i.severity})`);
  }
  score = Math.max(0, Math.min(100, score));
  const rationale = parts.length
    ? `Started at 100. ${parts.join("; ")}. Final: ${score}/100.`
    : "No rule violations detected: the question names an absolute deadline, a data source and objective conditions.";
  return { score, rationale };
}

/** Full heuristic proposal (fallback when AI is unavailable). */
export function heuristicArchitect(question: string, now = new Date()): ArchitectResult {
  const q = question.trim().replace(/\s+/g, " ");
  const issues = ruleChecks(q, now);
  const deadline = parseDeadline(q);
  const price = detectPrice(q);
  const asset = detectAsset(q);
  const domain = detectDomain(q, asset, price);
  const src = recommendSource(domain, q, asset);
  const date = deadline?.date ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 3, now.getUTCDate(), 23, 59, 59));
  const when = `23:59:59 UTC on ${longDate(date)}`;
  const sourceText = src.dataSource
    ? /^(Official|Certified)/.test(src.dataSource)
      ? `the ${src.dataSource[0].toLowerCase()}${src.dataSource.slice(1)}`
      : `the ${src.dataSource}`
    : "[designated data source — must be specified]";

  let improvedQuestion: string;
  let yesCondition: string;
  let noCondition: string;
  let methodology: string;

  if (domain === "crypto_price" && price && asset) {
    const l = q.toLowerCase();
    const down = /\b(below|under|fall|drop|dip)\b/.test(l);
    const amount = `$${price.amount.toLocaleString("en-US")}`;
    const cmp = down ? "fall to or below" : "reach or exceed";
    improvedQuestion = `Will the ${asset.ticker}/USD price published by ${src.dataSource.replace(` ${asset.ticker}/USD aggregated price`, "")} ${cmp} ${amount} at any time between market creation and ${when}?`;
    yesCondition = `Resolves YES if the ${src.dataSource} records a value ${down ? "at or below" : "at or above"} ${amount} at any time (any published data point) after market creation and on or before ${when}.`;
    noCondition = `Resolves NO if no ${src.dataSource} data point ${down ? "at or below" : "at or above"} ${amount} is recorded between market creation and ${when}.`;
    methodology = [
      `1. After ${when}, retrieve the full ${asset.ticker}/USD price history for the market window from ${src.dataSource}.`,
      `2. Determine whether any published data point is ${down ? "≤" : "≥"} ${amount}.`,
      `3. If the primary source is unavailable or disputed, use ${src.fallback}.`,
      "4. Record the exact data point, timestamp and source URL as evidence before proposing a resolution.",
    ].join("\n");
  } else {
    const core = stripDeadline(q, deadline?.text).replace(/\?$/, "");
    improvedQuestion = `${core}, as confirmed by ${sourceText}, on or before ${when}?`;
    yesCondition = `Resolves YES if ${sourceText} confirms that the event described occurred on or before ${when}.`;
    noCondition = `Resolves NO if ${sourceText} has not confirmed the event by ${when}, or confirms it did not occur.`;
    methodology = [
      `1. After ${when}, consult ${sourceText}.`,
      "2. Compare its published information against the YES condition exactly as written.",
      src.fallback ? `3. If the primary source is unavailable, use ${src.fallback}.` : "3. Define a fallback source before approving these rules.",
      "4. Store the deciding publication as evidence with its URL and publication time.",
    ].join("\n");
  }

  const { score, rationale } = scoreFromIssues(issues);
  const potentialDisputes = issues
    .filter((i) => i.severity !== "minor")
    .map((i) => {
      switch (i.code) {
        case "DATA_SOURCE_UNDEFINED": return "Traders citing different exchanges or publications for the same moment.";
        case "MEASUREMENT_AMBIGUOUS": return "A brief intraday wick on one venue versus the daily close on another.";
        case "TIMEZONE_MISSING": return "An event occurring on the deadline date in one timezone but after it in UTC.";
        case "SUBJECTIVE_LANGUAGE": return "Disagreement on whether an outcome was ‘significant’ enough.";
        case "DEADLINE_MISSING": case "DEADLINE_RELATIVE": return "No agreed point at which the market can be resolved.";
        default: return i.message;
      }
    });

  return {
    originalQuestion: question,
    improvedQuestion,
    yesCondition,
    noCondition,
    resolutionDeadline: date.toISOString(),
    timezone: "UTC",
    dataSource: src.dataSource,
    dataSourceUrl: src.dataSourceUrl,
    methodology,
    clarityScore: score,
    scoreRationale: rationale,
    issues,
    potentialDisputes: [...new Set(potentialDisputes)],
    engine: "HEURISTIC",
    model: null,
    aiError: null,
  };
}

function stripDeadline(q: string, dateText?: string) {
  if (!dateText) return q;
  const escaped = dateText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return q.replace(new RegExp(`\\s*(,\\s*)?(on or before|before|by|until|on|in)?\\s*${escaped}`, "i"), "").trim();
}

export type CriteriaDraft = {
  improvedQuestion: string;
  yesCondition: string;
  noCondition: string;
  resolutionDeadline: string;
  dataSource: string;
  methodology: string;
};

/**
 * Validates (possibly user-edited) criteria before approval.
 * Critical issues block approval; others are shown as warnings.
 */
export function validateCriteria(c: CriteriaDraft, now = new Date()): Issue[] {
  const issues: Issue[] = [];
  const yes = c.yesCondition.trim();
  const no = c.noCondition.trim();
  if (!yes) issues.push({ code: "OUTCOME_MISSING", severity: "critical", message: "The YES condition is empty." });
  if (!no) issues.push({ code: "OUTCOME_MISSING", severity: "critical", message: "The NO condition is empty." });
  if (yes && no && yes.toLowerCase() === no.toLowerCase())
    issues.push({ code: "OUTCOMES_INCONSISTENT", severity: "critical", message: "YES and NO conditions are identical." });
  if (!c.dataSource.trim() || /must be specified/i.test(c.dataSource))
    issues.push({ code: "DATA_SOURCE_UNDEFINED", severity: "critical", message: "An authoritative data source is required before approval." });
  if (!c.methodology.trim()) issues.push({ code: "OUTCOME_MISSING", severity: "major", message: "Describe the resolution methodology." });

  const d = new Date(c.resolutionDeadline);
  if (Number.isNaN(d.getTime())) issues.push({ code: "DEADLINE_MISSING", severity: "critical", message: "The resolution deadline is not a valid date." });
  else {
    if (d.getTime() < now.getTime()) issues.push({ code: "DEADLINE_IN_PAST", severity: "critical", message: "The resolution deadline is in the past." });
    const qDate = parseDeadline(c.improvedQuestion);
    if (qDate && Math.abs(qDate.date.getTime() - d.getTime()) > 36 * 3600e3)
      issues.push({
        code: "DEADLINE_INCONSISTENT",
        severity: "major",
        message: `The question mentions ${longDate(qDate.date)} but the resolution deadline is ${longDate(d)}.`,
      });
  }

  const amounts = (s: string) => new Set((s.match(/\$\s?[\d,]+(?:\.\d+)?/g) ?? []).map((a) => a.replace(/[\s,]/g, "")));
  const qa = amounts(c.improvedQuestion);
  for (const [label, text] of [["YES", yes], ["NO", no]] as const) {
    for (const a of amounts(text)) {
      if (qa.size && !qa.has(a))
        issues.push({ code: "OUTCOMES_INCONSISTENT", severity: "critical", message: `The ${label} condition uses ${a}, which does not match the threshold in the question.` });
    }
  }
  const subjective = SUBJECTIVE.filter((w) => new RegExp(`\\b${w}\\b`, "i").test(`${yes} ${no}`));
  if (subjective.length)
    issues.push({ code: "SUBJECTIVE_LANGUAGE", severity: "major", message: `Outcome conditions contain subjective wording: ${subjective.join(", ")}.` });
  return issues;
}

export const blocksApproval = (issues: Issue[]) => issues.some((i) => i.severity === "critical");
