import { Badge } from "@/components/ui/badge";
import { humanize } from "@/lib/utils";
import { INTEGRITY_LABEL, type IntegrityStatus } from "@/lib/integrity/rules";

export function IntegrityBadge({ status }: { status: IntegrityStatus }) {
  const tone = { HEALTHY: "emerald", NEEDS_ATTENTION: "amber", HIGH_RISK: "rust", UNDER_DISPUTE: "steel" } as const;
  return (
    <Badge tone={tone[status]} dot>
      {INTEGRITY_LABEL[status]}
    </Badge>
  );
}

const EVIDENCE_TONE = {
  SUBMITTED: "neutral",
  ACCESSIBLE: "outline",
  ANALYSED: "emerald",
  CORROBORATED: "emerald",
  CONTRADICTED: "amber",
  UNABLE_TO_VERIFY: "rust",
} as const;

export function EvidenceStatusBadge({ status }: { status: keyof typeof EVIDENCE_TONE }) {
  return <Badge tone={EVIDENCE_TONE[status]}>{status === "UNABLE_TO_VERIFY" ? "Unable to verify" : humanize(status)}</Badge>;
}

export function StanceBadge({ stance }: { stance: string | null | undefined }) {
  if (!stance || stance === "UNCLASSIFIED") return <Badge tone="outline">Unclassified</Badge>;
  if (stance === "SUPPORTS_YES") return <Badge tone="emerald">Supports YES</Badge>;
  if (stance === "SUPPORTS_NO") return <Badge tone="rust">Supports NO</Badge>;
  return <Badge tone="neutral">Neutral</Badge>;
}

export function RecommendationBadge({ value }: { value: string }) {
  const tone = { YES_SUPPORTED: "emerald", NO_SUPPORTED: "rust", INCONCLUSIVE: "amber", INSUFFICIENT_EVIDENCE: "neutral" } as const;
  const label = { YES_SUPPORTED: "YES supported", NO_SUPPORTED: "NO supported", INCONCLUSIVE: "Inconclusive", INSUFFICIENT_EVIDENCE: "Insufficient evidence" } as const;
  return <Badge tone={tone[value as keyof typeof tone] ?? "neutral"}>{label[value as keyof typeof label] ?? value}</Badge>;
}

export function DisputeStatusBadge({ status }: { status: string }) {
  const tone = { SUBMITTED: "steel", UNDER_REVIEW: "steel", EVIDENCE_REQUESTED: "amber", RESOLVED: "emerald", REJECTED: "neutral" } as const;
  return <Badge tone={tone[status as keyof typeof tone] ?? "neutral"}>{humanize(status)}</Badge>;
}

export function MarketStatusBadge({ status }: { status: string }) {
  const tone = { DRAFT: "outline", ACTIVE: "emerald", AWAITING_RESOLUTION: "amber", RESOLUTION_PROPOSED: "steel", DISPUTED: "steel", RESOLVED: "neutral", CANCELLED: "neutral" } as const;
  return <Badge tone={tone[status as keyof typeof tone] ?? "neutral"}>{humanize(status)}</Badge>;
}

/** Shown on anything produced without an LLM. Never omitted. */
export function EngineBadge({ engine, model }: { engine: "AI" | "HEURISTIC" | string; model?: string | null }) {
  return engine === "AI" ? (
    <Badge tone="emerald" className="font-normal">AI analysis{model ? ` (${model})` : ""}</Badge>
  ) : (
    <Badge tone="outline" className="font-normal">Heuristic engine, not AI</Badge>
  );
}

export function DemoBadge() {
  return <Badge tone="amber" className="font-normal">Demo data</Badge>;
}

export function LiveBadge({ label = "Live on PREDICT devnet" }: { label?: string }) {
  return (
    <Badge tone="emerald" className="font-normal">
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald opacity-60" />
        <span className="relative inline-flex size-1.5 rounded-full bg-emerald" />
      </span>
      {label}
    </Badge>
  );
}
