import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";
import { ScoreDial } from "@/components/domain/score-dial";
import { heuristicArchitect } from "@/lib/ai/heuristics";
import { getCurrentUser } from "@/lib/auth/session";
import { FlaggedQuestion } from "@/components/domain/flagged-question";

export const dynamic = "force-dynamic";

const EXAMPLE = "Will Bitcoin reach $150,000 before December 31, 2026?";

const STEPS = [
  { title: "Write rules that resolve", body: "The Market Architect finds vague deadlines, missing data sources and subjective wording, then drafts YES/NO conditions you edit and approve." },
  { title: "Collect evidence you can check", body: "Every source is retrieved and compared with the approved rules. Unreachable sources are reported as unverified, never as verified." },
  { title: "Recommend, with citations", body: "Recommendations cite stored evidence records only. Citations to anything else are discarded, and unsupported conclusions are downgraded." },
  { title: "Challenge in the open", body: "Anyone can dispute a proposed outcome. Reviewers request evidence, comment and decide, and every step lands in the audit trail." },
];

export default async function Landing() {
  const user = await getCurrentUser();
  // Computed live by the real heuristic engine, so the hero is a working demo, not a mockup.
  const analysis = heuristicArchitect(EXAMPLE);

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex h-16 max-w-[1180px] items-center justify-between px-5 sm:px-8">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link href="/markets" className="hidden px-3 text-[13.5px] text-muted hover:text-fg sm:inline">Explore markets</Link>
          {user ? <ButtonLink href="/overview" variant="primary" size="sm">Open IntelPro</ButtonLink> : (
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
            <h1 className="text-[34px] leading-[1.12] font-semibold tracking-[-0.025em] text-fg sm:text-[42px]">
              Prediction markets need more than liquidity and traders.
            </h1>
            <p className="mt-5 text-[16px] leading-relaxed text-muted">
              They need trustworthy questions, reliable evidence and transparent resolution. IntelPro is the intelligence and verification layer for markets on Solana and the PREDICT pm-AMM.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/architect" variant="primary" size="lg">Analyse a market question</ButtonLink>
              <ButtonLink href="/overview" size="lg">See the demo market</ButtonLink>
            </div>
          </div>

          <div className="rounded-[var(--radius-container)] border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-5 py-3 text-[12.5px] text-muted">
              <span>Market Architect</span>
              <span className="text-faint">Live analysis of the question below</span>
            </div>
            <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
              <ScoreDial score={analysis.clarityScore} size={124} />
              <div className="min-w-0">
                <FlaggedQuestion question={EXAMPLE} issues={analysis.issues} className="text-[17px] leading-[1.7]" />
                <p className="mt-3 text-[12.5px] text-faint">{analysis.issues.length} problems found. Wavy underline: critical or major. Dotted: minor.</p>
              </div>
            </div>
            <div className="border-t border-line px-5 py-4">
              <p className="text-[12.5px] text-muted">Suggested rewrite</p>
              <p className="mt-1.5 text-[14px] leading-relaxed text-fg">{analysis.improvedQuestion}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-line">
        <div className="mx-auto grid max-w-[1180px] gap-px px-5 py-14 sm:px-8 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <div key={s.title} className="py-4 pr-8">
              <p className="text-[13px] text-emerald">Step {i + 1}</p>
              <h2 className="mt-2 text-[15px] font-semibold text-fg">{s.title}</h2>
              <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-2 px-5 py-8 text-[12.5px] text-faint sm:flex-row sm:justify-between sm:px-8">
          <span>IntelPro: Intelligence Behind Every Prediction.</span>
          <span>Recommendations are advisory. Settlement stays with each market&apos;s designated resolution mechanism.</span>
        </div>
      </footer>
    </div>
  );
}
