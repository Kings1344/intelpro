import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { listMarkets } from "@/lib/services/markets";
import { marketListQuery, CATEGORIES } from "@/lib/validation";
import { RULES } from "@/lib/integrity/rules";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader, Stat } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { DemoBadge, IntegrityBadge } from "@/components/domain/badges";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Integrity Monitor" };

export default async function IntegrityPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const parsed = marketListQuery.safeParse(sp);
  const all = await listMarkets({ demo: parsed.success ? parsed.data.demo : "include", q: parsed.success ? parsed.data.q : undefined, category: parsed.success ? parsed.data.category : undefined });
  const rows = parsed.success && parsed.data.integrity ? all.filter((m) => m.integrity.status === parsed.data.integrity) : all;
  const count = (s: string) => all.filter((m) => m.integrity.status === s).length;

  return (
    <>
      <PageHeader title="IntelPro Market Integrity Monitor" description="Every status comes from named rules applied to stored rules, evidence, deadlines and disputes. Nothing here is an AI label." />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Healthy" value={count("HEALTHY")} href="/integrity?integrity=HEALTHY" tone="emerald" />
        <Stat label="Needs attention" value={count("NEEDS_ATTENTION")} href="/integrity?integrity=NEEDS_ATTENTION" tone="amber" />
        <Stat label="High risk" value={count("HIGH_RISK")} href="/integrity?integrity=HIGH_RISK" tone="rust" />
        <Stat label="Under dispute" value={count("UNDER_DISPUTE")} href="/integrity?integrity=UNDER_DISPUTE" tone="steel" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <form className="mb-4 flex flex-wrap gap-2.5" action="/integrity">
            <Input name="q" placeholder="Search questions" defaultValue={sp.q} className="w-full sm:w-64" />
            <Select name="integrity" defaultValue={sp.integrity ?? ""} className="w-44" aria-label="Integrity status">
              <option value="">All statuses</option><option value="HEALTHY">Healthy</option><option value="NEEDS_ATTENTION">Needs attention</option><option value="HIGH_RISK">High risk</option><option value="UNDER_DISPUTE">Under dispute</option>
            </Select>
            <Select name="category" defaultValue={sp.category ?? ""} className="w-40" aria-label="Category">
              <option value="">All categories</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </Select>
            <Select name="demo" defaultValue={sp.demo ?? "include"} className="w-44" aria-label="Demo data">
              <option value="include">Include demo data</option><option value="exclude">Hide demo data</option><option value="only">Demo data only</option>
            </Select>
            <Button type="submit">Apply</Button>
          </form>
          {rows.length === 0 ? (
            <EmptyState icon={<ShieldCheck />} title="No markets match" body="Change the filters to see more markets." />
          ) : (
            <div className="space-y-3">
              {rows.map((m) => (
                <Card key={m.id}>
                  <details className="group">
                    <summary className="flex cursor-pointer list-none flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-[13.5px] text-fg">{m.question}</p>
                        <p className="mt-1 text-[12px] text-faint">{m.category}, resolves {formatDate(m.resolutionDeadline)}. {m.integrity.findings.length} rule{m.integrity.findings.length === 1 ? "" : "s"} triggered.</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {m.isDemo && <DemoBadge />}
                        <IntegrityBadge status={m.integrity.status} />
                        <span className="text-[12px] text-faint group-open:hidden">Show why</span>
                        <span className="hidden text-[12px] text-faint group-open:inline">Hide</span>
                      </div>
                    </summary>
                    <div className="border-t border-line px-5 py-4">
                      {m.integrity.findings.length === 0 ? <p className="text-[13px] text-emerald-soft">No rule triggered: approved rules, clear wording, consistent evidence and no open disputes.</p> : (
                        <ul className="space-y-2 text-[13px]">
                          {m.integrity.findings.map((f, i) => (
                            <li key={i} className="flex gap-3">
                              <span className={f.level === "high" ? "w-20 shrink-0 text-rust" : "w-20 shrink-0 text-amber"}>{f.level === "high" ? "High" : "Attention"}</span>
                              <span><span className="text-fg">{f.rule}.</span> <span className="text-muted">{f.message}</span></span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <Link href={`/markets/${m.id}`} className="mt-3 inline-block text-[12.5px] text-emerald hover:underline">Open market</Link>
                    </div>
                  </details>
                </Card>
              ))}
            </div>
          )}
        </div>
        <Card className="h-fit">
          <CardHeader title="Rules" description="Status is the most severe finding. An open dispute overrides everything." />
          <CardBody>
            <ul className="space-y-2 text-[12.5px] leading-relaxed text-muted">
              {Object.values(RULES).map((r) => <li key={r}>{r}</li>)}
            </ul>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
