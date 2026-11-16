import { ExternalLink, FileText } from "lucide-react";
import { EngineBadge, EvidenceStatusBadge, StanceBadge } from "./badges";
import { ActionButton } from "./action-button";
import { STATUS_DESCRIPTIONS } from "@/lib/evidence/status";
import { formatDate, formatDateTime, hostnameOf, humanize, cn } from "@/lib/utils";

export type EvidenceRow = {
  id: string;
  title: string;
  sourceName: string;
  sourceKind?: "URL" | "PDF_UPLOAD";
  sourceUrl: string | null;
  file?: { fileName: string; sizeBytes: number; pageCount: number | null; extractionStatus: string; extractionError: string | null; extractedChars: number } | null;
  description: string;
  category: string;
  claimedStance: string;
  status: string;
  isDemo: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  fetchError: string | null;
  httpStatus: number | null;
  contentHash: string | null;
  disputeId: string | null;
  submittedBy: { name: string } | null;
  analyses: { id: string; engine: string; model: string | null; summary: string; stance: string; relevance: number; claims: unknown; reasoning: string; sourceAccessible: boolean; createdAt: Date }[];
};

export function EvidenceCard({ e, canAnalyse, highlight }: { e: EvidenceRow; canAnalyse: boolean; highlight?: boolean }) {
  const a = e.analyses[0];
  const claims = (a?.claims as { text: string; supports: string; quote: string }[] | undefined) ?? [];
  return (
    <article id={`ev-${e.id}`} className={cn("rounded-[var(--radius-container)] border bg-surface", highlight ? "border-emerald/50" : "border-line")}>
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-[14px] font-medium leading-snug text-fg">{e.title}</h3>
          {e.sourceKind === "PDF_UPLOAD" && e.file ? (
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted">
              <FileText className="size-3.5 shrink-0 text-faint" />
              <a href={`/api/evidence/${e.id}/file`} className="hover:text-emerald" data-testid="pdf-download">{e.file.fileName}</a>
              <span className="text-faint">
                {(e.file.sizeBytes / 1024).toFixed(0)} KB{e.file.pageCount ? `, ${e.file.pageCount} page${e.file.pageCount === 1 ? "" : "s"}` : ""}, {e.file.extractionStatus === "EXTRACTED" ? `${e.file.extractedChars.toLocaleString()} characters of text read` : e.file.extractionStatus === "NO_TEXT" ? "no readable text layer" : "could not be read"}
              </span>
              <span className="text-faint">from {e.sourceName}</span>
              {e.sourceUrl && <a href={e.sourceUrl} target="_blank" rel="noreferrer noopener nofollow" className="inline-flex items-center gap-1 hover:text-emerald">original <ExternalLink className="size-3" /></a>}
            </p>
          ) : e.sourceUrl ? (
            <a href={e.sourceUrl} target="_blank" rel="noreferrer noopener nofollow" className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-[12.5px] text-muted hover:text-emerald">
              {e.sourceName}, {hostnameOf(e.sourceUrl)} <ExternalLink className="size-3 shrink-0" />
            </a>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <EvidenceStatusBadge status={e.status as never} />
          {e.disputeId && <span className="text-[11.5px] text-steel">Dispute evidence</span>}
          {e.isDemo && <span className="text-[11.5px] text-amber">Demo</span>}
        </div>
      </div>
      <div className="space-y-3 border-t border-line px-5 py-4 text-[13px]">
        <p className="leading-relaxed text-muted">{e.description}</p>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-[12.5px]">
          <div className="flex gap-1.5"><dt className="text-faint">Category</dt><dd className="text-muted">{humanize(e.category)}</dd></div>
          <div className="flex gap-1.5"><dt className="text-faint">Published</dt><dd className="text-muted">{e.publishedAt ? formatDate(e.publishedAt) : "Unknown"}</dd></div>
          <div className="flex gap-1.5"><dt className="text-faint">Submitted</dt><dd className="text-muted">{formatDateTime(e.createdAt)}{e.submittedBy ? ` by ${e.submittedBy.name}` : ""}</dd></div>
          <div className="flex gap-1.5"><dt className="text-faint">Submitter claims</dt><dd><StanceBadge stance={e.claimedStance} /></dd></div>
        </dl>
        <p className="text-[12px] text-faint">{STATUS_DESCRIPTIONS[e.status as keyof typeof STATUS_DESCRIPTIONS]}{e.fetchError ? ` Reason: ${e.fetchError}` : ""}</p>
      </div>
      {a ? (
        <div className="space-y-3 border-t border-line bg-ground/40 px-5 py-4 text-[13px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-fg">Analysis</span>
            <EngineBadge engine={a.engine} model={a.model} />
            <StanceBadge stance={a.stance} />
            {a.sourceAccessible && <span className="text-[12px] text-faint">Relevance {Math.round(a.relevance * 100)}%</span>}
            <span className="text-[12px] text-faint">{formatDateTime(a.createdAt)}</span>
          </div>
          <p className="leading-relaxed text-muted">{a.summary}</p>
          {claims.length > 0 && (
            <ul className="space-y-2">
              {claims.map((c, i) => (
                <li key={i} className="border-l-2 border-line-strong pl-3">
                  <p className="text-fg">{c.text} <span className={c.supports === "YES" ? "text-emerald-soft" : c.supports === "NO" ? "text-rust" : "text-faint"}>({c.supports})</span></p>
                  <p className="mt-0.5 text-[12.5px] text-faint">Source text: “{c.quote}”</p>
                </li>
              ))}
            </ul>
          )}
          {e.analyses.length > 1 && <p className="text-[12px] text-faint">{e.analyses.length - 1} earlier analysis run(s) kept in history.</p>}
        </div>
      ) : null}
      {canAnalyse && !e.isDemo && (
        <div className="flex items-center gap-3 border-t border-line px-5 py-3">
          <ActionButton endpoint={`/api/evidence/${e.id}/analyze`} label={a ? "Re-run analysis" : e.sourceKind === "PDF_UPLOAD" ? "Analyse PDF text" : "Retrieve and analyse"} success="Analysis complete" />
          {e.contentHash && <span className="truncate font-mono text-[11.5px] text-faint">sha256 {e.contentHash.slice(0, 16)}…</span>}
        </div>
      )}
    </article>
  );
}
