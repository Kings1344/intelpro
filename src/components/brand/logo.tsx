import { cn } from "@/lib/utils";

/**
 * Lockline mark: four viewfinder brackets (verification, precision) framing a
 * single node (the resolved signal). Geometric, monochrome-friendly.
 */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden className={className}>
      <rect x="0.5" y="0.5" width="31" height="31" rx="7.5" fill="#15181B" stroke="#343A41" />
      <path d="M8 12.5V8h4.5M19.5 8H24v4.5M24 19.5V24h-4.5M12.5 24H8v-4.5" stroke="#2FB383" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 11.75 20.25 16 16 20.25 11.75 16 16 11.75Z" fill="#E9ECEE" />
      <circle cx="16" cy="16" r="1.4" fill="#0E1012" />
    </svg>
  );
}

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      {!compact && <span className="text-[15px] font-semibold tracking-[-0.01em] text-fg">Lockline</span>}
    </span>
  );
}
