"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client/api";
import { EVIDENCE_CATEGORIES } from "@/lib/validation";
import { cn, humanize } from "@/lib/utils";

const MAX_MB = 10;

export type EvidenceDraft = { title: string; sourceName: string; sourceUrl: string; description: string; publishedAt: string | null; category: string; claimedStance: string };

export function evidenceFromForm(f: FormData): EvidenceDraft {
  const published = String(f.get("publishedAt") ?? "");
  return {
    title: String(f.get("title") ?? ""),
    sourceName: String(f.get("sourceName") ?? ""),
    sourceUrl: String(f.get("sourceUrl") ?? ""),
    description: String(f.get("description") ?? ""),
    publishedAt: published ? new Date(`${published}T00:00:00Z`).toISOString() : null,
    category: String(f.get("category") ?? "OTHER"),
    claimedStance: String(f.get("claimedStance") ?? "UNCLASSIFIED"),
  };
}

export function EvidenceFields({ idPrefix = "ev", pdf = false }: { idPrefix?: string; pdf?: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Field label="Title" htmlFor={`${idPrefix}-title`} className="md:col-span-2"><Input id={`${idPrefix}-title`} name="title" required minLength={3} maxLength={200} placeholder="What this source shows" /></Field>
      {pdf ? (
        <>
          <Field label="PDF file" htmlFor={`${idPrefix}-file`} hint={`PDF with a text layer, up to ${MAX_MB} MB. Scanned documents are stored but cannot be read.`} className="md:col-span-2">
            <Input id={`${idPrefix}-file`} name="file" type="file" accept="application/pdf,.pdf" required className="h-auto py-1.5 file:mr-3 file:rounded file:border-0 file:bg-raised file:px-2.5 file:py-1 file:text-[12.5px] file:text-fg" />
          </Field>
          <Field label="Original URL (optional)" htmlFor={`${idPrefix}-url`} hint="Where the document was published, if anywhere." className="md:col-span-2"><Input id={`${idPrefix}-url`} name="sourceUrl" type="url" placeholder="https://" /></Field>
        </>
      ) : (
        <Field label="Source URL" htmlFor={`${idPrefix}-url`} hint="Public http(s) page. Lockline will try to retrieve it." className="md:col-span-2"><Input id={`${idPrefix}-url`} name="sourceUrl" type="url" required placeholder="https://" /></Field>
      )}
      <Field label="Source name" htmlFor={`${idPrefix}-src`}><Input id={`${idPrefix}-src`} name="sourceName" required minLength={2} placeholder="e.g. CoinGecko" /></Field>
      <Field label="Publication date (if known)" htmlFor={`${idPrefix}-pub`}><Input id={`${idPrefix}-pub`} name="publishedAt" type="date" /></Field>
      <Field label="Category" htmlFor={`${idPrefix}-cat`}>
        <Select id={`${idPrefix}-cat`} name="category" defaultValue="OFFICIAL_DATA">{EVIDENCE_CATEGORIES.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}</Select>
      </Field>
      <Field label="You believe it supports" htmlFor={`${idPrefix}-stance`} hint="Your claim. Analysis records its own view separately.">
        <Select id={`${idPrefix}-stance`} name="claimedStance" defaultValue="UNCLASSIFIED">
          <option value="UNCLASSIFIED">Not sure</option><option value="SUPPORTS_YES">YES</option><option value="SUPPORTS_NO">NO</option><option value="NEUTRAL">Neither</option>
        </Select>
      </Field>
      <Field label="Description" htmlFor={`${idPrefix}-desc`} className="md:col-span-2"><Textarea id={`${idPrefix}-desc`} name="description" required minLength={10} placeholder="What the source says and why it matters for this market" /></Field>
    </div>
  );
}

type PdfResult = { status: string; extraction: { status: "EXTRACTED" | "NO_TEXT" | "FAILED"; pageCount: number | null; chars: number; reason: string | null } };

export function EvidenceSubmitForm({ marketId }: { marketId: string }) {
  const router = useRouter();
  const { push } = useToast();
  const [kind, setKind] = useState<"url" | "pdf">("url");
  const [stage, setStage] = useState<"idle" | "uploading" | "reading">("idle");
  const [pdfResult, setPdfResult] = useState<PdfResult["extraction"] | null>(null);

  async function submitUrl(form: HTMLFormElement) {
    await api(`/api/markets/${marketId}/evidence`, { body: evidenceFromForm(new FormData(form)) });
    push({ tone: "success", title: "Evidence submitted", body: "Status: submitted. Run analysis to retrieve and check the source." });
  }

  async function submitPdf(form: HTMLFormElement) {
    const fd = new FormData(form);
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) throw new Error("Choose a PDF file.");
    if (file.size > MAX_MB * 1024 * 1024) throw new Error(`The file is larger than ${MAX_MB} MB.`);
    if (!/\.pdf$/i.test(file.name)) throw new Error("Only .pdf files are accepted.");
    const pub = String(fd.get("publishedAt") ?? "");
    fd.set("publishedAt", pub ? new Date(`${pub}T00:00:00Z`).toISOString() : "");
    setStage("uploading");
    const t = setTimeout(() => setStage("reading"), 800);
    try {
      const res = await fetch(`/api/markets/${marketId}/evidence/pdf`, { method: "POST", body: fd, credentials: "same-origin" });
      const json = (await res.json().catch(() => ({}))) as { data?: PdfResult; error?: { message: string } };
      if (!res.ok || !json.data) throw new Error(json.error?.message ?? `Upload failed (HTTP ${res.status}).`);
      setPdfResult(json.data.extraction);
      const x = json.data.extraction;
      push(
        x.status === "EXTRACTED"
          ? { tone: "success", title: "PDF uploaded and read", body: `${x.chars.toLocaleString()} characters across ${x.pageCount} page(s). Run analysis to compare it with the rules.` }
          : { tone: "error", title: "PDF stored, but its text could not be read", body: x.reason ?? undefined },
      );
    } finally {
      clearTimeout(t);
      setStage("idle");
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-[var(--radius-control)] border border-line bg-ground p-1" role="tablist" aria-label="Evidence type">
        {(["url", "pdf"] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => { setKind(k); setPdfResult(null); }} className={cn("h-8 rounded-[5px] text-[13px] font-medium", kind === k ? "bg-raised text-fg" : "text-muted hover:text-fg")}>
            {k === "url" ? "Link to a source" : "Upload a PDF"}
          </button>
        ))}
      </div>
      <form
        className="space-y-4"
        data-testid={`evidence-form-${kind}`}
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          try {
            if (kind === "url") await submitUrl(form);
            else await submitPdf(form);
            form.reset();
            router.refresh();
          } catch (err) {
            push({ tone: "error", title: "Evidence not submitted", body: err instanceof Error ? err.message : undefined });
            setStage("idle");
          }
        }}
      >
        <EvidenceFields pdf={kind === "pdf"} />
        <Button type="submit" variant="primary" loading={stage !== "idle"}>
          {stage === "uploading" ? "Uploading…" : stage === "reading" ? "Reading PDF text…" : kind === "pdf" ? "Upload PDF" : "Submit evidence"}
        </Button>
        {pdfResult && (
          <p className={cn("text-[12.5px]", pdfResult.status === "EXTRACTED" ? "text-emerald-soft" : "text-amber")} data-testid="pdf-result">
            {pdfResult.status === "EXTRACTED" ? `Read ${pdfResult.chars.toLocaleString()} characters from ${pdfResult.pageCount} page(s).` : pdfResult.reason}
          </p>
        )}
      </form>
    </div>
  );
}
