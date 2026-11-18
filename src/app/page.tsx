import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { LiveLinter } from "@/components/domain/live-linter";

export const dynamic = "force-dynamic";

const STEPS = [
  { title: "Write", body: "Type the question. The checker flags vague deadlines, missing data sources and subjective words, and drafts exact YES and NO conditions you approve." },
  { title: "Lock", body: "The approved rules are hashed and written to Solana before the market opens. Nobody can quietly change them later." },
  { title: "Trade", body: "The market launches on the PREDICT pm-AMM, linked to that hash. Traders can read the exact rules they are betting on." },
  { title: "Resolve", body: "The outcome is checked against the locked rules and stored evidence. Anyone can challenge it in the open." },
];

export default async function Landing() {
  const user = await getCurrentUser();

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex h-16 max-w-[1180px] items-center justify-between px-5 sm:px-8">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link href="/markets" className="hidden px-3 text-[13.5px] text-muted hover:text-fg sm:inline">Explore markets</Link>
          {user ? <ButtonLink href="/markets" variant="primary" size="sm">Open Lockline</ButtonLink> : (
            <>
              <ButtonLink href="/login" variant="ghost" size="sm">Sign in</ButtonLink>
              <ButtonLink href="/register" variant="primary" size="sm">Create account</ButtonLink>
            </>
          )}
        </nav>
      </header>

      <section className="mx-auto max-w-[1180px] px-5 pt-14 pb-16 sm:px-8 lg:pt-20">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_520px] lg:items-center">
          <div className="max-w-xl">
            <h1 className="text-[34px] leading-[1.12] font-semibold tracking-[-0.025em] text-fg sm:text-[44px]">
              Most market disputes start with one vague word.
            </h1>
            <p className="mt-5 text-[16px] leading-relaxed text-muted">
              Lockline finds it before launch, locks the fixed rules on Solana, and opens the market on the PREDICT pm-AMM. Traders bet on rules that can&apos;t move.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/architect" variant="primary" size="lg">Write a market</ButtonLink>
              <ButtonLink href="/markets?source=predict" size="lg">See live PREDICT markets</ButtonLink>
            </div>
          </div>

          <LiveLinter />
        </div>
      </section>

      <section className="border-t border-line">
        <div className="mx-auto grid max-w-[1180px] gap-px px-5 py-14 sm:px-8 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <div key={s.title} className="py-4 pr-8">
              <p className="text-[13px] text-emerald">{i + 1}</p>
              <h2 className="mt-2 text-[15px] font-semibold text-fg">{s.title}</h2>
              <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-2 px-5 py-8 text-[12.5px] text-faint sm:flex-row sm:justify-between sm:px-8">
          <span>Lockline. Rules locked before the first trade.</span>
          <span>Recommendations are advisory. Settlement stays with each market&apos;s designated resolution mechanism.</span>
        </div>
      </footer>
    </div>
  );
}
