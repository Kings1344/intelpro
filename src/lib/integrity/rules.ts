/**
 * IntelPro Market Integrity Monitor — rule engine.
 * Every status is derived from explicit, named rules over stored data (no AI labels).
 * Pure module — unit tested.
 */
export type IntegrityStatus = "HEALTHY" | "NEEDS_ATTENTION" | "HIGH_RISK" | "UNDER_DISPUTE";
export type FindingLevel = "attention" | "high";

export type IntegrityFinding = { rule: string; level: FindingLevel; message: string };

export type IntegrityInput = {
  status: string; // MarketStatus
  question: string;
  resolutionDeadline: Date | null;
  criteria: null | {
    approved: boolean;
    clarityScore: number;
    dataSource: string;
    resolutionDeadline: Date;
    issues: { severity: string; code: string }[];
  };
  evidence: { status: string }[];
  openDisputes: number;
  hasRecommendation: boolean;
  predictEndTs?: Date | null;
  now?: Date;
};

export const RULES = {
  NO_APPROVED_CRITERIA: "R1: No approved resolution criteria",
  LOW_CLARITY: "R2: Low market clarity",
  UNRESOLVED_CRITICAL: "R3: Critical wording issues remain",
  NO_DATA_SOURCE: "R4: Undefined data source",
  CONFLICTING_EVIDENCE: "R5: Conflicting evidence",
  UNAVAILABLE_SOURCES: "R6: Unavailable evidence sources",
  DEADLINE_APPROACHING: "R7: Deadline approaching without analysed evidence",
  DEADLINE_PASSED_UNRESOLVED: "R8: Deadline passed without a recommendation",
  OPEN_DISPUTE: "R9: Open dispute",
  INCONSISTENT_DEADLINE: "R10: Inconsistent deadline",
  NO_DEADLINE: "R11: No resolution deadline",
} as const;

const H = 3600e3;
const TERMINAL = new Set(["RESOLVED", "CANCELLED"]);

export function evaluateIntegrity(m: IntegrityInput): { status: IntegrityStatus; findings: IntegrityFinding[] } {
  const now = m.now ?? new Date();
  const f: IntegrityFinding[] = [];
  const live = !TERMINAL.has(m.status);
  const deadline = m.criteria?.resolutionDeadline ?? m.resolutionDeadline;

  if (!m.criteria || !m.criteria.approved) {
    f.push({
      rule: RULES.NO_APPROVED_CRITERIA,
      level: m.status === "DRAFT" ? "attention" : "high",
      message: m.status === "DRAFT" ? "Draft market: resolution rules have not been approved yet." : "Market is live without approved resolution rules.",
    });
  }
  if (m.criteria) {
    const s = m.criteria.clarityScore;
    if (s < 50) f.push({ rule: RULES.LOW_CLARITY, level: "high", message: `Clarity score ${s}/100 is below 50.` });
    else if (s < 70) f.push({ rule: RULES.LOW_CLARITY, level: "attention", message: `Clarity score ${s}/100 is below 70.` });
    if (!m.criteria.dataSource.trim()) f.push({ rule: RULES.NO_DATA_SOURCE, level: "high", message: "No authoritative data source is defined." });
  }

  const conflicted = m.evidence.filter((e) => e.status === "CONTRADICTED").length;
  if (conflicted) {
    const passed = deadline ? deadline.getTime() <= now.getTime() : false;
    f.push({
      rule: RULES.CONFLICTING_EVIDENCE,
      level: passed ? "high" : "attention",
      message: `${conflicted} evidence record(s) contradict other analysed sources${passed ? " after the deadline" : ""}.`,
    });
  }

  const unavailable = m.evidence.filter((e) => e.status === "UNABLE_TO_VERIFY").length;
  if (m.evidence.length && unavailable / m.evidence.length > 0.3)
    f.push({ rule: RULES.UNAVAILABLE_SOURCES, level: "attention", message: `${unavailable} of ${m.evidence.length} sources could not be retrieved.` });

  if (live && deadline) {
    const left = deadline.getTime() - now.getTime();
    const analysed = m.evidence.filter((e) => ["ANALYSED", "CORROBORATED", "CONTRADICTED"].includes(e.status)).length;
    if (left > 0 && left < 72 * H && analysed === 0)
      f.push({ rule: RULES.DEADLINE_APPROACHING, level: "attention", message: `Deadline in ${Math.max(1, Math.round(left / H))}h and no evidence has been analysed.` });
    if (left <= 0 && !m.hasRecommendation)
      f.push({ rule: RULES.DEADLINE_PASSED_UNRESOLVED, level: "high", message: "The deadline has passed and no resolution recommendation exists." });
  }
  if (live && !deadline) f.push({ rule: RULES.NO_DEADLINE, level: "high", message: "No resolution deadline is recorded." });

  if (m.criteria && m.resolutionDeadline && Math.abs(m.criteria.resolutionDeadline.getTime() - m.resolutionDeadline.getTime()) > H)
    f.push({ rule: RULES.INCONSISTENT_DEADLINE, level: "attention", message: "The market deadline differs from the approved criteria deadline." });
  if (m.predictEndTs && deadline && Math.abs(m.predictEndTs.getTime() - deadline.getTime()) > 6 * H)
    f.push({ rule: RULES.INCONSISTENT_DEADLINE, level: "attention", message: "The linked PREDICT market's on-chain end time differs from the approved deadline by more than 6h." });

  if (m.openDisputes > 0) f.push({ rule: RULES.OPEN_DISPUTE, level: "high", message: `${m.openDisputes} dispute(s) are open.` });

  const status: IntegrityStatus =
    m.openDisputes > 0 ? "UNDER_DISPUTE" : f.some((x) => x.level === "high") ? "HIGH_RISK" : f.length ? "NEEDS_ATTENTION" : "HEALTHY";
  return { status, findings: f };
}

export const INTEGRITY_LABEL: Record<IntegrityStatus, string> = {
  HEALTHY: "Healthy",
  NEEDS_ATTENTION: "Needs attention",
  HIGH_RISK: "High risk",
  UNDER_DISPUTE: "Under dispute",
};
