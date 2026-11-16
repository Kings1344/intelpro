import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalLink, Wallet } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getPortfolio } from "@/lib/services/portfolio";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, Mono, Notice, PageHeader, Table, Td } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DemoBadge, MarketStatusBadge } from "@/components/domain/badges";
import { RefreshTx } from "./refresh-tx";
import { explorerTxUrl, explorerAddressUrl } from "@/lib/config";
import { formatDateTime, humanize, pct, shortAddress } from "@/lib/utils";

export const metadata = { title: "Portfolio" };

export default async function PortfolioPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/portfolio");
  const p = await getPortfolio(user.id);

  return (
    <>
      <PageHeader title="Portfolio" description="Balances, positions and transactions read live from Solana for your linked wallets. Nothing here is estimated." />
      {p.wallets.length === 0 ? (
        <EmptyState icon={<Wallet />} title="No linked wallet" body="Link a Solana wallet in Settings by signing a free message. Positions and transaction history will then appear here." action={<ButtonLink href="/settings" variant="primary">Link a wallet</ButtonLink>} />
      ) : (
        <div className="space-y-6">
          {p.wallets.map((w) => (
            <Card key={w.address}>
              <CardHeader
                title={<a href={explorerAddressUrl(w.address)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-emerald"><Mono className="text-[13px] text-fg">{shortAddress(w.address, 8)}</Mono><ExternalLink className="size-3.5" /></a>}
                description={`Linked ${formatDateTime(w.verifiedAt)}, ${w.network}`}
                action={w.live ? <Badge tone="emerald" dot>Live</Badge> : <Badge tone="rust">RPC unavailable</Badge>}
              />
              {w.error ? <CardBody><Notice tone="amber">Could not read this wallet from Solana: {w.error}. No balances are shown rather than guessed.</Notice></CardBody> : (
                <>
                  <div className="grid grid-cols-2 border-b border-line md:grid-cols-3">
                    <Metric label="SOL" value={w.sol!.toLocaleString("en-US", { maximumFractionDigits: 4 })} />
                    <Metric label="mUSDC (PREDICT collateral)" value={w.musdc!.toLocaleString("en-US", { maximumFractionDigits: 2 })} />
                    <Metric label="Open PREDICT positions" value={String(w.positions.length)} />
                  </div>
                  {w.positions.length > 0 ? (
                    <Table head={["Market", "Side", "Tokens", "Current YES price", "State"]}>
                      {w.positions.map((pos) => (
                        <tr key={pos.market + pos.side}>
                          <Td><Link href={`/markets/predict/${pos.market}`} className="text-fg hover:text-emerald-soft">{pos.name}</Link></Td>
                          <Td><Badge tone={pos.side === "YES" ? "emerald" : "rust"}>{pos.side}</Badge></Td>
                          <Td className="text-fg">{pos.amount.toLocaleString("en-US", { maximumFractionDigits: 4 })}</Td>
                          <Td className="text-muted">{pos.yesPrice !== null ? pct(pos.yesPrice) : "—"}</Td>
                          <Td className="text-muted">{pos.phase}</Td>
                        </tr>
                      ))}
                    </Table>
                  ) : <CardBody><p className="text-[13px] text-muted">No YES/NO tokens from PREDICT markets in this wallet{p.predictStatus.reachable ? "" : " (PREDICT discovery is currently unavailable, so positions cannot be matched)"}.</p></CardBody>}
                  {w.chainActivity.length > 0 && (
                    <details className="border-t border-line">
                      <summary className="cursor-pointer px-5 py-3 text-[13px] text-muted hover:text-fg">Recent on-chain activity ({w.chainActivity.length})</summary>
                      <ul className="divide-y divide-line border-t border-line">
                        {w.chainActivity.map((s) => (
                          <li key={s.signature} className="flex items-center gap-3 px-5 py-2.5 text-[12.5px]">
                            <a href={explorerTxUrl(s.signature)} target="_blank" rel="noreferrer" className="hover:text-emerald"><Mono>{shortAddress(s.signature, 8)}</Mono></a>
                            <span className={s.ok ? "text-emerald-soft" : "text-rust"}>{s.ok ? "success" : "failed"}</span>
                            <span className="ml-auto text-faint">{s.at ? formatDateTime(s.at) : `slot ${s.slot}`}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </>
              )}
            </Card>
          ))}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader title="Transactions recorded by IntelPro" description="Status comes only from the cluster. Pending or unseen transactions are never shown as successful." />
          {p.transactions.length === 0 ? <CardBody><p className="text-[13px] text-muted">None yet. Anchoring rules, launching on PREDICT and trades appear here.</p></CardBody> : (
            <Table head={["Signature", "Type", "Market", "Status", "Recorded", ""]}>
              {p.transactions.map((t) => (
                <tr key={t.id}>
                  <Td><a href={explorerTxUrl(t.signature, t.network as never)} target="_blank" rel="noreferrer" className="hover:text-emerald"><Mono>{shortAddress(t.signature, 6)}</Mono></a></Td>
                  <Td className="text-muted">{humanize(t.kind)}</Td>
                  <Td className="max-w-[220px] truncate text-muted">{t.market ? <Link href={`/markets/${t.market.id}`} className="hover:text-fg">{t.market.question}</Link> : "—"}</Td>
                  <Td><Badge tone={t.status === "FAILED" || t.status === "NOT_FOUND" ? "rust" : t.status === "SUBMITTED" ? "amber" : "emerald"}>{humanize(t.status)}</Badge>{t.error && <p className="mt-1 max-w-[220px] truncate text-[11.5px] text-faint" title={t.error}>{t.error}</p>}</Td>
                  <Td className="whitespace-nowrap text-muted">{formatDateTime(t.createdAt)}</Td>
                  <Td>{t.status !== "FINALIZED" && <RefreshTx signature={t.signature} />}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader title="Market participation" description="Markets you created, submitted evidence to, or challenged." />
          <ul className="divide-y divide-line">
            {p.participation.length === 0 && <li className="px-5 py-3 text-[13px] text-muted">None yet.</li>}
            {p.participation.map((m) => (
              <li key={m.id} className="px-5 py-3">
                <Link href={`/markets/${m.id}`} className="line-clamp-2 text-[13px] text-fg hover:text-emerald-soft">{m.question}</Link>
                <div className="mt-1.5 flex gap-1.5"><MarketStatusBadge status={m.status} />{m.isDemo && <DemoBadge />}</div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-line px-5 py-4 last:border-r-0">
      <p className="text-[12.5px] text-muted">{label}</p>
      <p className="mt-1.5 text-[20px] font-semibold">{value}</p>
    </div>
  );
}
