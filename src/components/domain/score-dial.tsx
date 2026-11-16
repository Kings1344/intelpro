import { cn } from "@/lib/utils";

/** Instrument-style clarity dial: 40 ticks over a 270° sweep, lit up to the score. */
export function ScoreDial({ score, size = 148, label = "Clarity", className }: { score: number; size?: number; label?: string; className?: string }) {
  const ticks = 40;
  const lit = Math.round((Math.max(0, Math.min(100, score)) / 100) * ticks);
  const color = score >= 80 ? "#2FB383" : score >= 60 ? "#D4A246" : "#D0624E";
  const r1 = 42;
  const r2 = 48;
  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={`${label} score ${score} out of 100`}>
        {Array.from({ length: ticks }).map((_, i) => {
          const a = ((-225 + (i / (ticks - 1)) * 270) * Math.PI) / 180;
          const major = i % 5 === 0;
          const inner = major ? r1 - 2 : r1;
          return (
            <line
              key={i}
              x1={50 + inner * Math.cos(a)}
              y1={50 + inner * Math.sin(a)}
              x2={50 + r2 * Math.cos(a)}
              y2={50 + r2 * Math.sin(a)}
              stroke={i < lit ? color : "#2A2F35"}
              strokeWidth={major ? 1.6 : 1.1}
              strokeLinecap="round"
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[34px] font-semibold leading-none tracking-[-0.03em]" style={{ color }}>
          {score}
        </span>
        <span className="mt-1 text-[11.5px] text-muted">{label} / 100</span>
      </div>
    </div>
  );
}

export function ConfidenceBar({ value, className }: { value: number; className?: string }) {
  const pct = Math.round(value * 100);
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-raised">
        <div className="h-full rounded-full bg-emerald" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right text-[12px] text-muted">{pct}%</span>
    </div>
  );
}
