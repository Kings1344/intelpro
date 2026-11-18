import Link from "next/link";
import { Compass } from "lucide-react";
import { listMarkets } from "@/lib/services/markets";
import { marketListQuery, CATEGORIES } from "@/lib/validation";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, Table, Td } from "@/components/ui/misc";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { DemoBadge, IntegrityBadge, MarketStatusBadge } from "@/components/domain/badges";
import { PredictMarketList } from "./predict-list";
import { formatDate, cn } from "@/lib/utils";

export const metadata = { title: "Markets" };

export default async function MarketsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const source = sp.source === "predict" ? "predict" : "intelpro";
  const filters = marketListQuery.safeParse(sp);
  const rows = source === "intelpro" ? await listMarkets(filters.success ? filters.data : {}) : [];

  return (
    <>
      <PageHeader
        title="Markets"
        description="Markets whose rules were checked and locked with Lockline, and live markets read directly from the PREDICT pm-AMM program on Solana."
        actions={<ButtonLink href="/architect" variant="primary">New market</ButtonLink>}
      />
      <div className="mb-5 flex gap-1 border-b border-line" role="tablist">
        {[
          { key: "intelpro", label: "Locked markets" },
          { key: "predict", label: "Live PREDICT markets" },
        ].map((t) => (
          <Link
            key={t.key}
            role="tab"
            aria-selected={source === t.key}
            href={t.key === "predict" ? "/markets?source=predict" : "/markets"}
            className={cn("-mb-px border-b-2 px-3 py-2.5 text-[13.5px]", source === t.key ? "border-emerald text-fg" : "border-transparent text-muted hover:text-fg")}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {source === "predict" ? (
        <PredictMarketList />
      ) : (
        <>
          <form className="mb-4 flex flex-wrap gap-2.5" action="/markets">
            <Input name="q" placeholder="Search questions" defaultValue={sp.q} className="w-full sm:w-64" />
            <Select name="category" defaultValue={sp.category ?? ""} className="w-40" aria-label="Category">
              <option value="">All categories</option>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </Select>
            <Select name="status" defaultValue={sp.status ?? ""} className="w-48" aria-label="Market status">
              <option value="">Any market status</option>
              {["DRAFT", "ACTIVE", "AWAITING_RESOLUTION", "RESOLUTION_PROPOSED", "DISPUTED", "RESOLVED"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ").toLowerCase()}</option>)}
            </Select>
            <Select name="integrity" defaultValue={sp.integrity ?? ""} className="w-44" aria-label="Integrity">
              <option value="">Any integrity</option>
              <option value="HEALTHY">Healthy</option>
              <option value="NEEDS_ATTENTION">Needs attention</option>
              <option value="HIGH_RISK">High risk</option>
              <option value="UNDER_DISPUTE">Under dispute</option>
            </Select>
            <Select name="resolves" defaultValue={sp.resolves ?? ""} className="w-44" aria-label="Resolution date">
              <option value="">Any resolution date</option>
              <option value="7d">Next 7 days</option>
              <option value="30d">Next 30 days</option>
              <option value="90d">Next 90 days</option>
              <option value="past">Deadline passed</option>
            </Select>
            <Select name="demo" defaultValue={sp.demo ?? "include"} className="w-44" aria-label="Demo data">
              <option value="include">Include demo data</option>
              <option value="exclude">Hide demo data</option>
              <option value="only">Demo data only</option>
            </Select>
            <Button type="submit">Apply filters</Button>
          </form>

          {rows.length === 0 ? (
            <EmptyState icon={<Compass />} title="No markets match these filters" body="Clear the filters, or create a market with clear resolution rules in the Market Architect." action={<ButtonLink href="/markets">Clear filters</ButtonLink>} />
          ) : (
            <Card>
              <Table head={["Market", "Category", "Resolves", "YES / NO", "Liquidity", "Integrity", "Evidence", "Status"]}>
                {rows.map((m) => (
                  <tr key={m.id} className="hover:bg-raised/40">
                    <Td className="max-w-[420px]">
                      <Link href={`/markets/${m.id}`} className="line-clamp-2 text-fg hover:text-emerald-soft">{m.question}</Link>
                      <div className="mt-1.5 flex gap-1.5">
                        {m.isDemo && <DemoBadge />}
                        {m.predictMarketPda && <span className="text-[11.5px] text-emerald-soft">Linked to PREDICT</span>}
                      </div>
                    </Td>
                    <Td className="text-muted">{m.category}</Td>
                    <Td className="whitespace-nowrap text-muted">{formatDate(m.resolutionDeadline)}</Td>
                    <Td className="text-faint">{m.predictMarketPda ? <Link className="text-emerald hover:underline" href={`/markets/predict/${m.predictMarketPda}`}>Live prices</Link> : "Not traded"}</Td>
                    <Td className="text-faint">{m.predictMarketPda ? "On market page" : "—"}</Td>
                    <Td><IntegrityBadge status={m.integrity.status} /></Td>
                    <Td className="whitespace-nowrap text-muted">{m.evidence.length} record{m.evidence.length === 1 ? "" : "s"}</Td>
                    <Td><MarketStatusBadge status={m.status} /></Td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}
          <p className="mt-3 text-[12px] text-faint">Prices, volume and liquidity exist only for markets linked to an on-chain PREDICT market. Lockline never shows estimated prices for unlinked markets.</p>
        </>
      )}
    </>
  );
}
