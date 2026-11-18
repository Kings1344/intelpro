"use client";
import { useMemo, useState } from "react";
import { heuristicArchitect } from "@/lib/ai/heuristics";
import { ScoreDial } from "@/components/domain/score-dial";
import { FlaggedQuestion } from "@/components/domain/flagged-question";

const EXAMPLES = [
  "Will Bitcoin reach $150,000 before December 31, 2026?",
  "Will the Fed significantly cut rates soon?",
  "Will Solana flip Ethereum this year?",
];

/**
 * Landing-page demo: the real rule checker running in the browser on whatever the
 * visitor types. Deterministic engine, so it is instant and needs no account.
 */
export function LiveLinter() {
  const [question, setQuestion] = useState(EXAMPLES[1]);
  const analysis = useMemo(() => heuristicArchitect(question.trim() || " "), [question]);
  const issues = question.trim() ? analysis.issues : [];

  return (
    <div className="rounded-[var(--radius-container)] border border-line bg-surface">
      <div className="border-b border-line p-4">
        <label htmlFor="live-q" className="text-[12.5px] text-muted">Type a market question</label>
        <textarea
          id="live-q"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={2}
          maxLength={300}
          className="mt-2 w-full resize-none rounded-[var(--radius-control)] border border-line-strong bg-raised px-3 py-2 text-[15px] text-fg outline-none focus:border-emerald"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setQuestion(ex)}
              className="rounded-[var(--radius-chip)] border border-line px-2 py-1 text-[12px] text-muted hover:border-line-strong hover:text-fg"
            >
              {ex.length > 34 ? `${ex.slice(0, 34)}…` : ex}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
        <ScoreDial score={question.trim() ? analysis.clarityScore : 0} size={112} />
        <div className="min-w-0" aria-live="polite">
          <FlaggedQuestion question={question} issues={issues} className="text-[16px] leading-[1.7]" />
          <p className="mt-3 text-[12.5px] text-faint">
            {issues.length === 0
              ? "No problems found. This question is ready to lock."
              : `${issues.length} ${issues.length === 1 ? "problem" : "problems"} that could start a resolution dispute.`}
          </p>
          {issues.length > 0 && (
            <ul className="mt-2 space-y-1 text-[13px] text-muted">
              {issues.slice(0, 3).map((i) => (
                <li key={i.code + i.message}>{i.message}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {issues.length > 0 && (
        <div className="border-t border-line px-5 py-4">
          <p className="text-[12.5px] text-muted">Suggested rewrite</p>
          <p className="mt-1.5 text-[14px] leading-relaxed text-fg">{analysis.improvedQuestion}</p>
        </div>
      )}
    </div>
  );
}
