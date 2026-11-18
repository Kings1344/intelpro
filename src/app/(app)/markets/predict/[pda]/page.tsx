import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { getPredictMarket, getVaultLiquidity } from "@/lib/predict/server";
import { isSolanaAddress } from "@/lib/solana/base58";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Mono, Notice, PageHeader } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { LiveBadge } from "@/components/domain/badges";
import { TradePanel } from "@/components/predict/trade-panel";
import { explorerAddressUrl } from "@/lib/config";
import { formatDateTime, pct, shortAddress } from "@/lib/utils";

export const metadata = { title: "PREDICT market" };

export default async function PredictMarketPage({ params }: { params: Promise<{ pda: string }> }) {
  const { pda } = await params;
  if (!isSolanaAddress(pda)) notFound();
  const [m, user] = await Promise.all([getPredictMarket(pda), getCurrentUser()]);
  if (!m) {
    return (
      <>
        <PageHeader title="PREDICT market unavailable" />
        <Notice tone="amber">No pm-AMM market account could be read at {pda}. The RPC may be unreachable, or the address is not a PREDICT market. No data is shown rather than guessed.</Notice>
      </>
    );
  }
  const [liquidity, linked, wallets] = await Promise.all([
    getVaultLiquidity(m.vault),
    db.market.findUnique({ where: { predictMarketPda: pda }, select: { id: true, question: true } }),
    user ? db.wallet.findMany({ where: { userId: user.id }, select: { address: true } }) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title={m.name}
        meta={<><LiveBadge /><Badge tone={m.phase === "open" ? "emerald" : "neutral"}>{m.phase}</Badge></>}
        description={linked ? <>Monitored by Lockline: <Link className="text-emerald hover:underline" href={`/markets/${linked.id}`}>view rules, evidence and integrity</Link>.</> : "Not linked to an Lockline market, so it has no approved rules or evidence vault here."}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Price label="YES" value={m.yesPrice} tone="text-emerald-soft" source={m.priceSource} />
            <Price label="NO" value={m.noPrice} tone="text-rust" source={m.priceSource} />
            <div className="rounded-[var(--radius-container)] border border-line bg-surface px-4 py-4">
              <p className="text-[12.5px] text-muted">Vault liquidity</p>
              <p className="mt-2 text-[22px] font-semibold">{liquidity !== null ? liquidity.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—"}</p>
              <p className="mt-1 text-[12px] text-faint">mUSDC held by the market vault</p>
            </div>
            <div className="rounded-[var(--radius-container)] border border-line bg-surface px-4 py-4">
              <p className="text-[12.5px] text-muted">Ends</p>
              <p className="mt-2 text-[15px] font-semibold">{formatDateTime(m.endTs)}</p>
            </div>
          </div>
          <Card>
            <CardHeader title="On-chain account" description="Read directly from the pm-AMM program." />
            <CardBody>
              <dl className="grid gap-x-6 gap-y-3 text-[13px] sm:grid-cols-2">
                {[
                  ["Market", m.pda], ["Authority", m.authority], ["YES mint", m.yesMint], ["NO mint", m.noMint], ["Vault", m.vault],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-faint">{k}</dt>
                    <dd className="mt-0.5">{v ? <a href={explorerAddressUrl(v)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-emerald"><Mono>{shortAddress(v, 8)}</Mono><ExternalLink className="size-3" /></a> : "—"}</dd>
                  </div>
                ))}
                <div><dt className="text-faint">Market ID</dt><dd className="mt-0.5 text-fg">{m.marketId ?? "—"}</dd></div>
                <div><dt className="text-faint">Started</dt><dd className="mt-0.5 text-fg">{formatDateTime(m.startTs)}</dd></div>
                <div><dt className="text-faint">Initial YES price</dt><dd className="mt-0.5 text-fg">{m.initialPriceBps !== null ? `${m.initialPriceBps / 100}%` : "—"}</dd></div>
                <div><dt className="text-faint">Resolved</dt><dd className="mt-0.5 text-fg">{m.resolved ? (m.winningSide ? `Yes, ${m.winningSide} won` : "Yes (winning side not recorded)") : "No"}</dd></div>
              </dl>
            </CardBody>
          </Card>
        </div>
        <Card>
          <CardHeader title="Trade" description="Signed by your wallet on Solana." />
          <CardBody>
            <TradePanel
              market={{ pda: m.pda, phase: m.phase, reserveYes: m.reserveYes, reserveNo: m.reserveNo, lEff: m.lEff, authority: m.authority, yesPrice: m.yesPrice, collateralMint: m.collateralMint, yesMint: m.yesMint, noMint: m.noMint }}
              linkedWallets={wallets.map((w) => w.address)}
              signedIn={!!user}
              intelproMarketId={linked?.id ?? null}
            />
          </CardBody>
        </Card>
      </div>
    </>
  );
}

const SOURCE_LABEL: Record<string, string> = { reserves: "From on-chain reserves", initial_price: "Seed price (no liquidity yet)", lp_residuals: "From LP residuals", resolution: "Settled outcome", default: "Default 50/50 (no data)", unavailable: "Not computable" };

function Price({ label, value, tone, source }: { label: string; value: number | null; tone: string; source: string }) {
  return (
    <div className="rounded-[var(--radius-container)] border border-line bg-surface px-4 py-4">
      <p className="text-[12.5px] text-muted">{label} price</p>
      <p className={`mt-2 text-[26px] font-semibold leading-none ${tone}`}>{value !== null ? pct(value) : "—"}</p>
      <p className="mt-2 text-[12px] text-faint">{value === null ? "Not computable" : SOURCE_LABEL[source]}</p>
    </div>
  );
}
