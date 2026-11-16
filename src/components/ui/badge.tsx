import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const badgeVariants = cva("inline-flex items-center gap-1.5 rounded-[var(--radius-chip)] border px-1.5 py-0.5 text-[11.5px] font-medium leading-4 whitespace-nowrap", {
  variants: {
    tone: {
      neutral: "border-line-strong bg-raised text-muted",
      emerald: "border-emerald/30 bg-emerald-wash text-emerald-soft",
      amber: "border-amber/30 bg-amber-wash text-amber",
      rust: "border-rust/30 bg-rust-wash text-rust",
      steel: "border-steel/30 bg-steel-wash text-steel",
      outline: "border-line-strong text-muted",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, dot, children }: { className?: string; dot?: boolean; children: React.ReactNode } & VariantProps<typeof badgeVariants>) {
  return (
    <span className={cn(badgeVariants({ tone }), className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
