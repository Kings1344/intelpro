import Link from "next/link";
import { Compass } from "lucide-react";
import { listMarkets } from "@/lib/services/markets";
import { Card } from "@/components/ui/card";
import { EmptyState, Table, Td } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { DemoBadge, IntegrityBadge, MarketStatusBadge, RecommendationBadge } from "./badges";
import { formatDate } from "@/lib/utils";

/** Shared market picker for module index pages (Evidence Vault, Resolution Intelligence). */
export async function MarketIndex({ hrefBase, mode }: { hrefBase: string; mode: "evidence" | "resolution" }) {
  const rows = await listMarkets();
  if (!rows.length)
    return <EmptyState icon={<Compass />} title="No markets yet" body="Create a market in the Market Architect to open its evidence vault and resolution page." action={<ButtonLink href="/architect" variant="primary">Analyse a question</ButtonLink>} />;
  return (
    <Card>
      <Table head={["Market", "Resolves", mode === "evidence" ? "Evidence" : "Latest recommendation", "Integrity", "Status"]}>
        {rows.map((m) => (
          <tr key={m.id} className="hover:bg-raised/40">
            <Td className="max-w-[460px]">
              <Link href={`${hrefBase}/${m.id}`} className="line-clamp-2 text-fg hover:text-emerald-soft">{m.question}</Link>
              {m.isDemo && <div className="mt-1.5"><DemoBadge /></div>}
            </Td>
            <Td className="whitespace-nowrap text-muted">{formatDate(m.resolutionDeadline)}</Td>
            <Td className="text-muted">
              {mode === "evidence"
                ? `${m.evidence.length} record${m.evidence.length === 1 ? "" : "s"}${m.evidence.some((e) => e.status === "CONTRADICTED") ? ", conflicts" : ""}`
                : m.recommendations[0] ? <RecommendationBadge value={m.recommendations[0].recommendation} /> : "None yet"}
            </Td>
            <Td><IntegrityBadge status={m.integrity.status} /></Td>
            <Td><MarketStatusBadge status={m.status} /></Td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}
