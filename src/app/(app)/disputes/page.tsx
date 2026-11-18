import Link from "next/link";
import { Gavel } from "lucide-react";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, Table, Td } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { DemoBadge, DisputeStatusBadge } from "@/components/domain/badges";
import { formatDateTime, cn } from "@/lib/utils";

export const metadata = { title: "Disputes" };

const TABS = [
  { key: "open", label: "Open", statuses: ["SUBMITTED", "UNDER_REVIEW", "EVIDENCE_REQUESTED"] },
  { key: "closed", label: "Closed", statuses: ["RESOLVED", "REJECTED"] },
  { key: "all", label: "All", statuses: undefined },
];

export default async function DisputesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "open" } = await searchParams;
  const t = TABS.find((x) => x.key === tab) ?? TABS[0];
  const rows = await db.dispute.findMany({
    where: t.statuses ? { status: { in: t.statuses as never } } : undefined,
    orderBy: { createdAt: "desc" },
    include: { market: { select: { id: true, question: true, isDemo: true } }, challenger: { select: { name: true } }, reviewer: { select: { name: true } }, _count: { select: { evidence: true, comments: true } } },
  });
  return (
    <>
      <PageHeader
        title="Disputes"
        description="Challenges to proposed resolutions and recommendations, reviewed in the open. This is Lockline's review workflow, not an on-chain arbitration protocol."
        actions={<ButtonLink href="/disputes/new" variant="primary">Submit a challenge</ButtonLink>}
      />
      <div className="mb-4 flex gap-1 border-b border-line">
        {TABS.map((x) => (
          <Link key={x.key} href={`/disputes?tab=${x.key}`} className={cn("-mb-px border-b-2 px-3 py-2.5 text-[13.5px]", x.key === t.key ? "border-emerald text-fg" : "border-transparent text-muted hover:text-fg")}>{x.label}</Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={<Gavel />} title={t.key === "open" ? "No open disputes" : "No disputes here"} body="If a proposed outcome or recommendation looks wrong, submit a challenge with your reasoning and evidence." action={<ButtonLink href="/disputes/new">Submit a challenge</ButtonLink>} />
      ) : (
        <Card>
          <Table head={["Market", "Challenger", "Reviewer", "Evidence", "Submitted", "Status"]}>
            {rows.map((d) => (
              <tr key={d.id} className="hover:bg-raised/40">
                <Td className="max-w-[420px]">
                  <Link href={`/disputes/${d.id}`} className="line-clamp-2 text-fg hover:text-emerald-soft">{d.market.question}</Link>
                  <p className="mt-1 line-clamp-1 text-[12px] text-faint">{d.reason}</p>
                  {d.isDemo && <div className="mt-1.5"><DemoBadge /></div>}
                </Td>
                <Td className="text-muted">{d.challenger.name}</Td>
                <Td className="text-muted">{d.reviewer?.name ?? "Unassigned"}</Td>
                <Td className="text-muted">{d._count.evidence}</Td>
                <Td className="whitespace-nowrap text-muted">{formatDateTime(d.createdAt)}</Td>
                <Td><DisputeStatusBadge status={d.status} /></Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </>
  );
}
