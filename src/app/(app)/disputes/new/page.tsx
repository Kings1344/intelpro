import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { Card, CardBody } from "@/components/ui/card";
import { Notice, PageHeader } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { NewDisputeForm } from "./form";
import { recLabel } from "@/lib/utils";

export const metadata = { title: "Submit a challenge" };

export default async function NewDisputePage({ searchParams }: { searchParams: Promise<{ market?: string }> }) {
  const { market } = await searchParams;
  const user = await getCurrentUser();
  const markets = await db.market.findMany({
    where: { status: { in: ["ACTIVE", "AWAITING_RESOLUTION", "RESOLUTION_PROPOSED", "DISPUTED"] }, OR: [{ recommendations: { some: {} } }, { status: "RESOLUTION_PROPOSED" }] },
    select: { id: true, question: true, isDemo: true, proposedOutcome: true, recommendations: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, recommendation: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return (
    <>
      <PageHeader title="Submit a challenge" description="Explain why the proposed outcome or recommendation is wrong, and attach the evidence that shows it." />
      {!user ? (
        <Notice tone="steel" title="Sign in to submit a challenge"><span className="mt-2 inline-block"><ButtonLink href="/login?next=/disputes/new" variant="primary" size="sm">Sign in</ButtonLink></span></Notice>
      ) : markets.length === 0 ? (
        <Notice tone="neutral">No market currently has a proposed resolution or recommendation to challenge.</Notice>
      ) : (
        <Card className="max-w-3xl">
          <CardBody className="py-5">
            <NewDisputeForm
              initialMarket={market}
              markets={markets.map((m) => ({ id: m.id, question: m.question, isDemo: m.isDemo, target: m.proposedOutcome ? `Proposed outcome: ${m.proposedOutcome}` : `Recommendation: ${recLabel(m.recommendations[0]?.recommendation ?? "")}`, recommendationId: m.recommendations[0]?.id ?? null }))}
            />
          </CardBody>
        </Card>
      )}
    </>
  );
}
