"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertOctagon, AlertTriangle, Info } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { ScoreDial } from "@/components/domain/score-dial";
import { FlaggedQuestion } from "@/components/domain/flagged-question";
import { EngineBadge } from "@/components/domain/badges";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client/api";
import { blocksApproval, validateCriteria } from "@/lib/ai/heuristics";
import type { ArchitectResult, Issue } from "@/lib/ai/types";
import { CATEGORIES } from "@/lib/validation";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  "Will Bitcoin reach $150,000 before December 31, 2026?",
  "Will the Fed significantly cut rates soon?",
  "Will SOL hit $500 by end of 2027?",
];

const toLocalUtc = (iso: string) => (iso ? new Date(iso).toISOString().slice(0, 16) : "");
const fromLocalUtc = (v: string) => (v ? new Date(`${v}:00Z`).toISOString() : "");

export function ArchitectWorkbench({ initialQuestion }: { initialQuestion: string }) {
  const router = useRouter();
  const { push } = useToast();
  const [question, setQuestion] = useState(initialQuestion);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("Crypto");
  const [analysing, setAnalysing] = useState(false);
  const [saving, setSaving] = useState<"draft" | "approve" | null>(null);
  const [result, setResult] = useState<ArchitectResult | null>(null);
  const [draft, setDraft] = useState<ArchitectResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function analyse() {
    setError(null);
    setAnalysing(true);
    try {
      const r = await api<ArchitectResult>("/api/architect/analyze", { body: { question } });
      setResult(r);
      setDraft(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed.");
    } finally {
      setAnalysing(false);
    }
  }

  const liveIssues: Issue[] = useMemo(() => (draft ? validateCriteria(draft) : []), [draft]);
  const blocked = blocksApproval(liveIssues);

  async function save(approve: boolean) {
    if (!draft || !result) return;
    setSaving(approve ? "approve" : "draft");
    try {
      const m = await api<{ id: string }>("/api/markets", {
        body: {
          category,
          approve,
          criteria: {
            originalQuestion: result.originalQuestion,
            improvedQuestion: draft.improvedQuestion,
            yesCondition: draft.yesCondition,
            noCondition: draft.noCondition,
            resolutionDeadline: draft.resolutionDeadline,
            timezone: "UTC",
            dataSource: draft.dataSource,
            dataSourceUrl: draft.dataSourceUrl || null,
            methodology: draft.methodology,
            clarityScore: result.clarityScore,
            issues: result.issues,
            engine: result.engine,
            model: result.model,
          },
        },
      });
      push({ tone: "success", title: approve ? "Market created with approved rules" : "Draft market saved" });
      router.push(`/markets/${m.id}`);
    } catch (e) {
      push({ tone: "error", title: "Could not save the market", body: e instanceof Error ? e.message : undefined });
      setSaving(null);
    }
  }

  const set = (k: keyof ArchitectResult) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft((d) => d && { ...d, [k]: e.target.value });

  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="space-y-4 py-5">
          <Field label="Market question" htmlFor="q" hint="Write it the way a trader would. Lockline analyses this exact text.">
            <Textarea id="q" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Will … happen by …?" className="min-h-[72px] text-[15px]" maxLength={500} />
          </Field>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Category" htmlFor="cat" className="w-44">
              <Select id="cat" value={category} onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </Select>
            </Field>
            <Button variant="primary" onClick={analyse} loading={analysing} disabled={question.trim().length < 10}>
              Analyse question
            </Button>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-faint">
              <span>Try:</span>
              {EXAMPLES.map((ex) => (
                <button key={ex} className="text-muted underline-offset-4 hover:text-fg hover:underline" onClick={() => setQuestion(ex)}>
                  {ex.length > 44 ? `${ex.slice(0, 44)}…` : ex}
                </button>
              ))}
            </div>
          </div>
          {error && <Notice tone="rust">{error}</Notice>}
        </CardBody>
      </Card>

      {result && draft && (
        <>
          <Card>
            <div className="flex flex-col gap-6 p-5 md:flex-row md:items-center">
              <ScoreDial score={result.clarityScore} />
              <div className="min-w-0 flex-1">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <EngineBadge engine={result.engine} model={result.model} />
                  <span className="text-[12.5px] text-faint">{result.issues.length} issue{result.issues.length === 1 ? "" : "s"} found in the submitted wording</span>
                </div>
                <FlaggedQuestion question={result.originalQuestion} issues={result.issues} className="text-[19px] leading-[1.7] tracking-[-0.01em]" />
                <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-muted">{result.scoreRationale}</p>
                {result.aiError && <Notice tone="amber" className="mt-3">AI analysis was unavailable ({result.aiError}). These results come from the deterministic rules engine.</Notice>}
              </div>
            </div>
            <div className="grid border-t border-line md:grid-cols-2">
              <div className="border-line p-5 md:border-r">
                <h3 className="text-[13px] font-semibold text-fg">Findings</h3>
                {result.issues.length === 0 ? <p className="mt-2 text-[13px] text-muted">No problems found.</p> : (
                  <ul className="mt-3 space-y-3">
                    {result.issues.map((i, idx) => <IssueRow key={idx} issue={i} />)}
                  </ul>
                )}
              </div>
              <div className="p-5">
                <h3 className="text-[13px] font-semibold text-fg">Disputes this wording invites</h3>
                {result.potentialDisputes.length === 0 ? <p className="mt-2 text-[13px] text-muted">None identified.</p> : (
                  <ul className="mt-3 list-disc space-y-2 pl-4 text-[13px] leading-relaxed text-muted marker:text-faint">
                    {result.potentialDisputes.map((p) => <li key={p}>{p}</li>)}
                  </ul>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Resolution rules" description="Edit anything. Checks re-run as you type, and critical problems block approval." />
            <CardBody className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-4">
                <Field label="Improved market question" htmlFor="iq">
                  <Textarea id="iq" value={draft.improvedQuestion} onChange={set("improvedQuestion")} className="min-h-[64px] text-[14.5px]" />
                </Field>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label="Resolves YES if" htmlFor="yes">
                    <Textarea id="yes" value={draft.yesCondition} onChange={set("yesCondition")} className="min-h-[110px]" />
                  </Field>
                  <Field label="Resolves NO if" htmlFor="no">
                    <Textarea id="no" value={draft.noCondition} onChange={set("noCondition")} className="min-h-[110px]" />
                  </Field>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <Field label="Resolution deadline (UTC)" htmlFor="dl">
                    <Input id="dl" type="datetime-local" value={toLocalUtc(draft.resolutionDeadline)} onChange={(e) => setDraft((d) => d && { ...d, resolutionDeadline: fromLocalUtc(e.target.value) })} />
                  </Field>
                  <Field label="Authoritative data source" htmlFor="ds" className="md:col-span-2">
                    <Input id="ds" value={draft.dataSource} onChange={set("dataSource")} placeholder="e.g. CoinGecko BTC/USD aggregated price" />
                  </Field>
                </div>
                <Field label="Data source URL (optional)" htmlFor="dsu">
                  <Input id="dsu" value={draft.dataSourceUrl ?? ""} onChange={set("dataSourceUrl")} placeholder="https://" />
                </Field>
                <Field label="Resolution methodology" htmlFor="meth">
                  <Textarea id="meth" value={draft.methodology} onChange={set("methodology")} className="min-h-[130px] font-mono text-[12.5px]" />
                </Field>
              </div>

              <aside className="space-y-4">
                <div className="rounded-[var(--radius-control)] border border-line bg-ground p-4">
                  <p className="text-[13px] font-semibold text-fg">Approval checks</p>
                  {liveIssues.length === 0 ? (
                    <p className="mt-2 text-[13px] text-emerald-soft">All checks pass. These rules can be approved.</p>
                  ) : (
                    <ul className="mt-3 space-y-3">{liveIssues.map((i, idx) => <IssueRow key={idx} issue={i} />)}</ul>
                  )}
                </div>
                <div className="space-y-2">
                  <Button variant="primary" className="w-full" size="lg" disabled={blocked} loading={saving === "approve"} onClick={() => save(true)}>
                    Approve rules and create market
                  </Button>
                  <Button className="w-full" loading={saving === "draft"} onClick={() => save(false)}>
                    Save as draft
                  </Button>
                  <p className="text-[12px] leading-relaxed text-faint">Approved rules are versioned. You can anchor their hash on Solana from the market page.</p>
                </div>
              </aside>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}

function IssueRow({ issue }: { issue: Issue }) {
  const Icon = issue.severity === "critical" ? AlertOctagon : issue.severity === "major" ? AlertTriangle : Info;
  return (
    <li className="flex gap-2.5 text-[13px] leading-relaxed">
      <Icon className={cn("mt-0.5 size-4 shrink-0", issue.severity === "critical" ? "text-rust" : issue.severity === "major" ? "text-amber" : "text-faint")} />
      <span>
        <span className="font-medium text-fg capitalize">{issue.severity}</span>
        <span className="text-muted">. {issue.message}</span>
      </span>
    </li>
  );
}
