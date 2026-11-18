import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive } from "lucide-react";
import { getMarketDetail, latestApproved } from "@/lib/services/markets";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { DemoBadge } from "@/components/domain/badges";
import { EvidenceCard } from "@/components/domain/evidence-card";
import { EvidenceSubmitForm } from "@/components/domain/evidence-form";
import { DEMO_NOTICE } from "@/lib/demo/data";
import { cn } from "@/lib/utils";

export const metadata = { title: "Evidence Vault" };

const FILTERS = [
  { key: "all", label: "All" },
  { key: "SUBMITTED", label: "Submitted" },
  { key: "ACCESSIBLE", label: "Accessible" },
  { key: "ANALYSED", label: "Analysed" },
  { key: "CORROBORATED", label: "Corroborated" },
  { key: "CONTRADICTED", label: "Contradicted" },
  { key: "UNABLE_TO_VERIFY", label: "Unable to verify" },
];

export default async function MarketEvidencePage({ params, searchParams }: { params: Promise<{ marketId: string }>; searchParams: Promise<{ status?: string }> }) {
  const [{ marketId }, { status = "all" }] = await Promise.all([params, searchParams]);
  const [m, user] = await Promise.all([getMarketDetail(marketId), getCurrentUser()]);
  if (!m) notFound();
  const criteria = latestApproved(m.criteria) ?? m.criteria[0];
  const evidence = status === "all" ? m.evidence : m.evidence.filter((e) => e.status === status);
  const canAnalyse = can(user?.role, "evidence:analyse");

  return (
    <>
      <PageHeader
        title="Evidence Vault"
        description={<Link href={`/markets/${m.id}`} className="hover:text-fg">{m.question}</Link>}
        meta={m.isDemo ? <DemoBadge /> : undefined}
      />
      {m.isDemo && <Notice tone="amber" className="mb-5">{DEMO_NOTICE} Sample sources use reserved example.com domains and are never fetched. Evidence you submit here is real and is retrieved normally.</Notice>}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {FILTERS.map((f) => {
              const n = f.key === "all" ? m.evidence.length : m.evidence.filter((e) => e.status === f.key).length;
              return (
                <Link key={f.key} href={`/evidence/${m.id}${f.key === "all" ? "" : `?status=${f.key}`}`} className={cn("rounded-[var(--radius-chip)] border px-2.5 py-1 text-[12.5px]", status === f.key ? "border-emerald/40 bg-emerald-wash text-emerald-soft" : "border-line text-muted hover:text-fg")}>
                  {f.label} <span className="text-faint">{n}</span>
                </Link>
              );
            })}
          </div>
          {evidence.length === 0 ? (
            <EmptyState icon={<Archive />} title={m.evidence.length ? "No evidence with this status" : "No evidence yet"} body="Submit the first source for this market. Lockline records it as submitted, then retrieves it and checks it against the approved rules when you run analysis." />
          ) : (
            <ol className="relative space-y-4 border-l border-line pl-5">
              {evidence.map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute top-5 -left-[24.5px] size-2 rounded-full border border-line-strong bg-ground" />
                  <EvidenceCard e={e} canAnalyse={canAnalyse} />
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="space-y-6">
          {criteria && (
            <Card>
              <CardHeader title={criteria.approved ? "Compared against approved rules" : "Rules are not approved yet"} description={`Version ${criteria.version}`} />
              <CardBody className="space-y-2 text-[13px] leading-relaxed">
                <p><span className="text-emerald-soft">YES</span> <span className="text-muted">{criteria.yesCondition}</span></p>
                <p><span className="text-rust">NO</span> <span className="text-muted">{criteria.noCondition}</span></p>
                <p className="text-faint">Source: {criteria.dataSource || "not defined"}</p>
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="Submit evidence" />
            <CardBody>
              {user ? <EvidenceSubmitForm marketId={m.id} /> : <Notice tone="steel">Sign in to submit evidence.</Notice>}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
