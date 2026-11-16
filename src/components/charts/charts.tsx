"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/** Single-series daily evidence volume. One hue, thin bars, recessive axes, hover tooltip. */
export function EvidenceVolumeChart({ data }: { data: { day: string; count: number }[] }) {
  const filled = fillDays(data, 30);
  return (
    <div className="h-[180px] w-full" role="img" aria-label="Evidence records submitted per day, last 30 days">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={filled} margin={{ top: 8, right: 4, left: -24, bottom: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke="#262B30" strokeDasharray="0" />
          <XAxis dataKey="day" tickLine={false} axisLine={{ stroke: "#343A41" }} tick={{ fill: "#687079", fontSize: 11 }} tickFormatter={(d: string) => d.slice(5)} interval={6} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "#687079", fontSize: 11 }} width={40} />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            contentStyle={{ background: "#1B1F23", border: "1px solid #343A41", borderRadius: 6, fontSize: 12, color: "#E9ECEE" }}
            labelStyle={{ color: "#98A0A8" }}
            formatter={(v: number) => [`${v} record${v === 1 ? "" : "s"}`, "Evidence"]}
          />
          <Bar dataKey="count" fill="#2FB383" radius={[3, 3, 0, 0]} maxBarSize={14} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function fillDays(data: { day: string; count: number }[], n: number) {
  const map = new Map(data.map((d) => [d.day, d.count]));
  const out: { day: string; count: number }[] = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i)).toISOString().slice(0, 10);
    out.push({ day: d, count: map.get(d) ?? 0 });
  }
  return out;
}

const STATUS = [
  { key: "HEALTHY", label: "Healthy", color: "#2FB383" },
  { key: "NEEDS_ATTENTION", label: "Needs attention", color: "#D4A246" },
  { key: "HIGH_RISK", label: "High risk", color: "#D0624E" },
  { key: "UNDER_DISPUTE", label: "Under dispute", color: "#7A9CC6" },
] as const;

/** Integrity distribution: one segmented bar (2px surface gaps) + a labelled legend with counts. */
export function IntegrityDistribution({ counts }: { counts: Record<string, number> }) {
  const total = STATUS.reduce((a, s) => a + (counts[s.key] ?? 0), 0);
  return (
    <div>
      <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full bg-raised" role="img" aria-label={STATUS.map((s) => `${s.label}: ${counts[s.key] ?? 0}`).join(", ")}>
        {total > 0 &&
          STATUS.filter((s) => counts[s.key]).map((s) => (
            <div key={s.key} title={`${s.label}: ${counts[s.key]}`} style={{ width: `${(counts[s.key] / total) * 100}%`, background: s.color }} />
          ))}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3">
        {STATUS.map((s) => (
          <div key={s.key} className="flex items-center justify-between gap-3 text-[13px]">
            <dt className="flex items-center gap-2 text-muted">
              <span className="size-2 rounded-full" style={{ background: s.color }} />
              {s.label}
            </dt>
            <dd className="font-medium text-fg">{counts[s.key] ?? 0}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
