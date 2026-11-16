import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { db } from "@/lib/db";

/** Getting-started checklist computed from the user's real activity. Hidden once complete. */
export async function Onboarding({ userId }: { userId: string }) {
  const [wallets, markets, approved, evidence, demo] = await Promise.all([
    db.wallet.count({ where: { userId } }),
    db.market.count({ where: { creatorId: userId } }),
    db.marketCriteria.count({ where: { approved: true, market: { creatorId: userId } } }),
    db.evidence.count({ where: { submittedById: userId } }),
    db.market.findFirst({ where: { isDemo: true }, select: { id: true }, orderBy: { createdAt: "asc" } }),
  ]);
  const steps = [
    { done: !!demo, label: "Explore the demonstration market", href: demo ? `/markets/${demo.id}` : "/markets" },
    { done: markets > 0, label: "Analyse a question in the Market Architect", href: "/architect" },
    { done: approved > 0, label: "Approve resolution rules", href: "/architect" },
    { done: evidence > 0, label: "Submit and analyse evidence", href: "/evidence" },
    { done: wallets > 0, label: "Link a Solana wallet", href: "/settings" },
  ];
  const left = steps.filter((s) => !s.done).length;
  if (left === 0) return null;
  return (
    <div className="mb-6 rounded-[var(--radius-container)] border border-line bg-surface px-5 py-4">
      <p className="text-[13.5px] font-medium text-fg">Get started with IntelPro</p>
      <p className="mt-0.5 text-[12.5px] text-faint">{left} of {steps.length} steps left</p>
      <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {steps.map((s) => (
          <li key={s.label}>
            <Link href={s.href} className="flex items-start gap-2 text-[13px] text-muted hover:text-fg">
              {s.done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald" /> : <Circle className="mt-0.5 size-4 shrink-0 text-faint" />}
              <span className={s.done ? "line-through decoration-faint" : ""}>{s.label}</span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
