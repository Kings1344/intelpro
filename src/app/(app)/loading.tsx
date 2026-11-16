export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-6">
      <div className="h-7 w-64 animate-pulse rounded bg-surface" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-[var(--radius-container)] border border-line bg-surface" />)}
      </div>
      <div className="h-80 animate-pulse rounded-[var(--radius-container)] border border-line bg-surface" />
    </div>
  );
}
