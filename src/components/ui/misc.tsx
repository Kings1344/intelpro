import Link from "next/link";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, actions, meta }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; meta?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 max-w-3xl">
        {meta && <div className="mb-2 flex flex-wrap items-center gap-2">{meta}</div>}
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.015em] text-fg">{title}</h1>
        {description && <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, body, action, className }: { icon?: React.ReactNode; title: string; body: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-start gap-3 rounded-[var(--radius-container)] border border-dashed border-line-strong px-6 py-8", className)}>
      {icon && <div className="text-faint [&_svg]:size-5">{icon}</div>}
      <div>
        <p className="text-[14px] font-medium text-fg">{title}</p>
        <p className="mt-1 max-w-lg text-[13px] leading-relaxed text-muted">{body}</p>
      </div>
      {action}
    </div>
  );
}

export function Stat({ label, value, sub, href, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; href?: string; tone?: "rust" | "amber" | "emerald" | "steel" }) {
  const color = tone ? { rust: "text-rust", amber: "text-amber", emerald: "text-emerald-soft", steel: "text-steel" }[tone] : "text-fg";
  const inner = (
    <>
      <p className="text-[12.5px] text-muted">{label}</p>
      <p className={cn("mt-2 text-[26px] font-semibold leading-none tracking-[-0.02em]", color)}>{value}</p>
      {sub && <p className="mt-2 text-[12px] text-faint">{sub}</p>}
    </>
  );
  const cls = "block rounded-[var(--radius-container)] border border-line bg-surface px-4 py-4";
  return href ? (
    <Link href={href} className={cn(cls, "transition-colors hover:border-line-strong")}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export function Mono({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("font-mono text-[12px] text-muted", className)}>{children}</span>;
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn("h-px bg-line", className)} />;
}

export function Notice({ tone = "neutral", title, children, className }: { tone?: "neutral" | "amber" | "rust" | "emerald" | "steel"; title?: string; children: React.ReactNode; className?: string }) {
  const map = {
    neutral: "border-line-strong bg-raised text-muted",
    amber: "border-amber/30 bg-amber-wash text-amber",
    rust: "border-rust/30 bg-rust-wash text-rust",
    emerald: "border-emerald/30 bg-emerald-wash text-emerald-soft",
    steel: "border-steel/30 bg-steel-wash text-steel",
  };
  return (
    <div className={cn("rounded-[var(--radius-control)] border px-3.5 py-2.5 text-[13px] leading-relaxed", map[tone], className)}>
      {title && <p className="font-medium">{title}</p>}
      <div className={cn(title && "mt-0.5 opacity-90")}>{children}</div>
    </div>
  );
}

export function Table({ head, children, className }: { head: React.ReactNode[]; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto scrollbar-thin", className)}>
      <table className="w-full border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b border-line">
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-4 py-2.5 text-[12px] font-medium text-faint first:pl-5 last:pr-5">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3 align-top first:pl-5 last:pr-5", className)}>{children}</td>;
}
