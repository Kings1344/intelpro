import { cn } from "@/lib/utils";
import type { Issue } from "@/lib/ai/types";

/**
 * Renders the submitted question with the exact phrases that caused each issue
 * underlined by severity, so the analysis is visibly about *this* text.
 */
export function FlaggedQuestion({ question, issues, className }: { question: string; issues: Issue[]; className?: string }) {
  const rank = { critical: 3, major: 2, minor: 1 } as const;
  const marks: { start: number; end: number; sev: Issue["severity"]; title: string }[] = [];
  const lower = question.toLowerCase();
  for (const i of issues) {
    const parts = (i.excerpt ?? "").split(",").map((p) => p.trim()).filter((p) => p.length >= 2);
    for (const p of parts) {
      const at = lower.indexOf(p.toLowerCase());
      if (at >= 0) marks.push({ start: at, end: at + p.length, sev: i.severity, title: i.message });
    }
  }
  marks.sort((a, b) => a.start - b.start || rank[b.sev] - rank[a.sev]);
  const segments: React.ReactNode[] = [];
  let cursor = 0;
  for (const m of marks) {
    if (m.start < cursor) continue; // overlapping: keep the first (highest severity at that position)
    if (m.start > cursor) segments.push(question.slice(cursor, m.start));
    segments.push(
      <span key={`${m.start}-${m.end}`} className={`flag-${m.sev}`} title={m.title}>
        {question.slice(m.start, m.end)}
      </span>,
    );
    cursor = m.end;
  }
  segments.push(question.slice(cursor));
  return <p className={cn("text-fg", className)}>{segments}</p>;
}
