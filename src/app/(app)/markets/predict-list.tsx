"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw, Radio } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, Notice, Table, Td, Mono } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { LiveBadge } from "@/components/domain/badges";
import { api } from "@/lib/client/api";
import { formatDateTime, shortAddress, pct } from "@/lib/utils";
import type { PredictMarketView } from "@/lib/predict/normalize";

type Resp = { status: { reachable: boolean; enabled: boolean; error: string | null; programId: string; network: string; checkedAt: string }; total: number; markets: (PredictMarketView & { liquidityUsdc: number | null })[] };

export function PredictMarketList() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      setData(await api<Resp>(`/api/predict/markets?${expired ? "expired=1&" : ""}${refresh ? "refresh=1" : ""}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load PREDICT markets.");
    } finally {
      setLoading(false);
    }
  }, [expired]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {data?.status.reachable ? <LiveBadge /> : <Badge tone="rust" dot>PREDICT not reachable</Badge>}
        {data && <span className="text-[12.5px] text-faint">Program <Mono>{shortAddress(data.status.programId, 6)}</Mono>, {data.total} market accounts found, read {formatDateTime(data.status.checkedAt)}</span>}
        <div className="flex-1" />
        <label className="flex items-center gap-2 text-[13px] text-muted">
          <input type="checkbox" checked={expired} onChange={(e) => setExpired(e.target.checked)} className="accent-[#2FB383]" /> Include expired
        </label>
        <Button size="sm" onClick={() => load(true)} loading={loading}><RefreshCw /> Refresh</Button>
      </div>
      {error && <Notice tone="rust">{error}</Notice>}
      {data?.status.error && <Notice tone="amber" title="Live data unavailable">{data.status.error} Nothing below is simulated; when discovery fails the list stays empty.</Notice>}
      {loading && !data ? (
        <div className="h-40 animate-pulse rounded-[var(--radius-container)] border border-line bg-surface" />
      ) : !data?.markets.length ? (
        <EmptyState icon={<Radio />} title={data?.status.reachable ? "No open PREDICT markets right now" : "No live data"} body="Create one from any approved Lockline market (Launch on PREDICT), or include expired markets." />
      ) : (
        <Card>
          <Table head={["Market", "YES", "NO", "Vault liquidity", "Ends", "State", "Address"]}>
            {data.markets.map((m) => (
              <tr key={m.pda} className="hover:bg-raised/40">
                <Td className="max-w-[360px]">
                  <Link href={`/markets/predict/${m.pda}`} className="line-clamp-2 text-fg hover:text-emerald-soft">{m.name}</Link>
                  {m.isGroupLeg && <span className="mt-1 block text-[11.5px] text-faint">Multi-outcome leg</span>}
                </Td>
                <Td className="font-medium text-emerald-soft">{m.yesPrice !== null ? pct(m.yesPrice) : <span className="font-normal text-faint">n/a</span>}</Td>
                <Td className="font-medium text-rust">{m.noPrice !== null ? pct(m.noPrice) : <span className="font-normal text-faint">n/a</span>}</Td>
                <Td className="text-muted">{m.liquidityUsdc !== null ? `${m.liquidityUsdc.toLocaleString("en-US", { maximumFractionDigits: 2 })} mUSDC` : "—"}</Td>
                <Td className="whitespace-nowrap text-muted">{formatDateTime(m.endTs)}</Td>
                <Td><Badge tone={m.phase === "open" ? "emerald" : m.phase === "resolved" ? "neutral" : "amber"}>{m.phase}</Badge></Td>
                <Td><Mono>{shortAddress(m.pda)}</Mono></Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
      <p className="text-[12px] text-faint">Read live from Solana with the official @pm-amm/sdk. Prices use the SDK&apos;s pm-AMM formula; a price is shown only if it is a valid probability. Trading volume is not exposed by the program and is therefore not shown.</p>
    </div>
  );
}
