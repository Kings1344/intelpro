export type Severity = "critical" | "major" | "minor";

export type IssueCode =
  | "DEADLINE_MISSING"
  | "DEADLINE_RELATIVE"
  | "TIMEZONE_MISSING"
  | "BOUNDARY_AMBIGUOUS"
  | "DATA_SOURCE_UNDEFINED"
  | "MEASUREMENT_AMBIGUOUS"
  | "QUOTE_CURRENCY_MISSING"
  | "SUBJECTIVE_LANGUAGE"
  | "COMPOUND_CONDITION"
  | "NOT_BINARY_QUESTION"
  | "TOO_SHORT"
  | "UNDEFINED_TERM"
  | "OUTCOMES_INCONSISTENT"
  | "OUTCOME_MISSING"
  | "DEADLINE_INCONSISTENT"
  | "DEADLINE_IN_PAST"
  | "POTENTIAL_DISPUTE";

export type Issue = {
  code: IssueCode | string;
  severity: Severity;
  message: string;
  excerpt?: string;
};

export type Engine = "AI" | "HEURISTIC";

export type ArchitectResult = {
  originalQuestion: string;
  improvedQuestion: string;
  yesCondition: string;
  noCondition: string;
  resolutionDeadline: string; // ISO-8601 UTC
  timezone: string;
  dataSource: string;
  dataSourceUrl: string | null;
  methodology: string;
  clarityScore: number;
  scoreRationale: string;
  issues: Issue[];
  potentialDisputes: string[];
  engine: Engine;
  model: string | null;
  /** Non-null when the AI path was attempted and failed — shown to the user. */
  aiError: string | null;
};
