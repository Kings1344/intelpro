"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { WalletButton } from "@/components/wallet/wallet-button";
import { cn, shortAddress } from "@/lib/utils";
import { explorerTxUrl, publicConfig } from "@/lib/config";
import { DECIMALS, fetchBalances, quote, requestDevnetUsdc, resolvePredictMarket, simulateQuote, swap, type Balances, type SwapQuote } from "@/lib/predict/client";
import { fromRaw, toRaw, type Mode, type Side } from "@/lib/predict/quote";
import { useChain, txMessage, type VerifiedTx } from "./use-chain";

type M = { pda: string; phase: string; reserveYes: number | null; reserveNo: number | null; lEff: number | null; authority: string | null; yesPrice: number | null; collateralMint: string | null; yesMint: string | null; noMint: string | null };

type Stage = "idle" | "signing" | "confirming" | "done" | "failed";
const fmt = (raw: number, digits = 4) => fromRaw(raw, DECIMALS).toLocaleString("en-US", { maximumFractionDigits: digits });

export function TradePanel({ market, linkedWallets, signedIn, intelproMarketId }: { market: M; linkedWallets: string[]; signedIn: boolean; intelproMarketId: string | null }) {
  const router = useRouter();
  const { push } = useToast();
  const chain = useChain(linkedWallets);
  const [mode, setMode] = useState<Mode>("buy");
  const [side, setSide] = useState<Side>("yes");
  const [amount, setAmount] = useState("10");
  const [slippageBps, setSlippageBps] = useState(200);
  const [q, setQ] = useState<SwapQuote | null>(null);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);
  const [simulated, setSimulated] = useState<"pending" | "yes" | "no">("no");
  const [balances, setBalances] = useState<Balances | null>(null);
  const [balanceErr, setBalanceErr] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [last, setLast] = useState<VerifiedTx | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reserves = market.reserveYes !== null && market.reserveNo !== null && market.lEff ? { reserveYes: market.reserveYes, reserveNo: market.reserveNo, lEff: market.lEff } : null;
  const balanceRaw = balances ? (mode === "buy" ? balances.usdcRaw : side === "yes" ? balances.yesRaw : balances.noRaw) : null;
  const inUnit = mode === "buy" ? "mUSDC" : `${side.toUpperCase()} tokens`;
  const outUnit = mode === "buy" ? `${side.toUpperCase()} tokens` : "mUSDC";

  const loadBalances = useCallback(async () => {
    if (!chain.address) return;
    setBalanceErr(null);
    try {
      setBalances(await fetchBalances(chain.connection, chain.address, { usdc: market.collateralMint ?? publicConfig.predict.usdcMint, yes: market.yesMint, no: market.noMint }));
    } catch (e) {
      setBalances(null);
      setBalanceErr(e instanceof Error ? e.message : "Could not read balances.");
    }
  }, [chain.address, chain.connection, market.collateralMint, market.yesMint, market.noMint]);
  useEffect(() => { loadBalances(); }, [loadBalances]);

  useEffect(() => {
    const n = Number(amount);
    // Drop the previous quote immediately: a quote must never outlive the inputs it was made for.
    setQ(null);
    setSimulated("no");
    if (!reserves || !(n > 0)) { setQ(null); setQuoteErr(!reserves ? "This market's reserves could not be read, so it cannot be quoted." : null); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const est = await quote(reserves, { mode, side, amountInRaw: toRaw(n, DECIMALS), slippageBps, balanceRaw });
        if (cancelled) return;
        setQ(est);
        setQuoteErr(null);
        if (!chain.address) return setSimulated("no");
        setSimulated("pending");
        // Refine with an on-chain simulation of the exact instruction (authoritative output).
        const out = await simulateQuote(chain.connection, chain.address, market.pda, market, est);
        if (cancelled) return;
        if (out !== null) {
          setQ({ ...est, expectedOutRaw: out, minOutRaw: Math.floor((out * (10_000 - slippageBps)) / 10_000) });
          setSimulated("yes");
        } else setSimulated("no");
      } catch (e) {
        if (!cancelled) { setQ(null); setQuoteErr(e instanceof Error ? e.message : "Quote unavailable."); setSimulated("no"); }
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, mode, side, slippageBps, balanceRaw, market.reserveYes, market.reserveNo, market.lEff]);

  async function execute() {
    if (!q) return;
    // Final guard: only execute a quote made for exactly what the form shows.
    if (q.mode !== mode || q.side !== side || q.amountInRaw !== toRaw(Number(amount), DECIMALS)) {
      push({ tone: "error", title: "Quote out of date", body: "The trade details changed. Check the new quote and try again." });
      return;
    }
    setStage("signing");
    try {
      const sig = await swap(chain.connection, chain.anchorWallet!, market.pda, q);
      setStage("confirming");
      const v = await chain.recordTx(sig, "PREDICT_SWAP", intelproMarketId ?? undefined);
      setLast(v);
      setStage(v.status === "CONFIRMED" || v.status === "FINALIZED" ? "done" : "failed");
      push(txMessage(v));
      await loadBalances();
      router.refresh();
    } catch (e) {
      setStage("failed");
      const msg = e instanceof Error ? e.message : String(e);
      push({ tone: "error", title: "Trade not completed", body: /reject|denied|cancel/i.test(msg) ? "You declined the transaction in your wallet." : /0x1771|slippage|minimum|MinOutput/i.test(msg) ? "The price moved beyond your slippage limit. Nothing was traded." : msg });
    }
  }

  if (!signedIn) return <Notice tone="steel">Sign in and link a wallet to trade. Prices shown are live.</Notice>;
  if (!chain.address) return (<div className="space-y-2 text-[13px]"><p className="text-muted">Connect a {publicConfig.solana.network} wallet to trade.</p><WalletButton /></div>);
  if (!chain.linked) return <Notice tone="amber">Link wallet {shortAddress(chain.address)} in <Link className="underline" href="/settings">Settings</Link> first, so trades can be verified and shown in your portfolio.</Notice>;

  const isAuthority = market.authority === chain.address;
  const working = stage === "signing" || stage === "confirming";

  return (
    <div className="space-y-4 text-[13px]" data-testid="trade-panel">
      {market.phase !== "open" ? (
        <Notice tone="neutral">This market is {market.phase}; trading is closed.</Notice>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-1 rounded-[var(--radius-control)] border border-line bg-ground p-1" role="tablist" aria-label="Trade type">
            {(["buy", "sell"] as const).map((m) => (
              <button key={m} role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setStage("idle"); }} className={cn("h-8 rounded-[5px] text-[13px] font-medium capitalize", mode === m ? "bg-raised text-fg" : "text-muted hover:text-fg")}>{m}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-1 rounded-[var(--radius-control)] border border-line bg-ground p-1" role="radiogroup" aria-label="Outcome">
            {(["yes", "no"] as const).map((s) => (
              <button key={s} role="radio" aria-checked={side === s} onClick={() => setSide(s)} className={cn("h-9 rounded-[5px] text-[13px] font-medium", side === s ? (s === "yes" ? "bg-emerald-wash text-emerald-soft" : "bg-rust-wash text-rust") : "text-muted hover:text-fg")}>
                {mode === "buy" ? "Buy" : "Sell"} {s.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between text-[12.5px] text-muted">
            <span>
              Balance: {balances ? <span className="text-fg">{fmt(balanceRaw ?? 0)} {inUnit}</span> : balanceErr ? <span className="text-rust">unavailable</span> : "loading…"}
            </span>
            <button className="inline-flex items-center gap-1 text-faint hover:text-fg" onClick={loadBalances} aria-label="Refresh balances"><RefreshCw className="size-3.5" /></button>
          </div>
          {balanceErr && <Notice tone="amber">Could not read balances from Solana: {balanceErr}</Notice>}

          <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2">
            <Field label={`Amount (${inUnit})`} htmlFor="amt">
              <div className="relative">
                <Input id="amt" inputMode="decimal" type="number" min={0} step="any" value={amount} onChange={(e) => { setAmount(e.target.value); setStage("idle"); }} className="pr-12" />
                {balanceRaw !== null && balanceRaw > 0 && (
                  <button type="button" className="absolute top-1/2 right-2 -translate-y-1/2 text-[12px] text-emerald hover:underline" onClick={() => setAmount(String(fromRaw(balanceRaw, DECIMALS)))}>Max</button>
                )}
              </div>
            </Field>
            <Field label="Max slippage" htmlFor="slip">
              <Select id="slip" value={slippageBps} onChange={(e) => setSlippageBps(Number(e.target.value))}>
                <option value={100}>1%</option><option value={200}>2%</option><option value={500}>5%</option>
              </Select>
            </Field>
          </div>

          <div className="space-y-1.5 rounded-[var(--radius-control)] border border-line bg-ground p-3" data-testid="quote">
            {q ? (
              <>
                <Row label={simulated === "yes" ? "You receive" : "You receive (estimated)"} value={`${fmt(q.expectedOutRaw)} ${outUnit}`} />
                <Row label="Minimum after slippage" value={`${fmt(q.minOutRaw)} ${outUnit}`} />
                <Row label={`Protocol fee (2% of the ${mode === "buy" ? "input" : "output"})`} value={`${fmt(q.feeRaw)} mUSDC`} />
                {q.priceAfter !== null && <Row label="YES price after trade" value={`${(q.priceAfter * 100).toFixed(1)}%`} />}
                {q.priceImpact !== null && <Row label="Price impact" value={`${(q.priceImpact * 100).toFixed(2)}%`} />}
                <p className="pt-1 text-[11.5px] text-faint" data-testid="quote-source">
                  {simulated === "yes" ? "Simulated on-chain against the current market state." : simulated === "pending" ? "Estimated; checking against an on-chain simulation…" : "Estimated with the pm-AMM curve (on-chain simulation unavailable)."} The program rejects the trade if it would return less than the minimum.
                </p>
              </>
            ) : (
              <p className="text-faint">{quoteErr ?? "Enter an amount to get a quote."}</p>
            )}
          </div>

          <Button variant="primary" className="w-full" size="lg" disabled={!q || working || simulated === "pending"} loading={working} onClick={execute}>
            {stage === "signing" ? "Approve in your wallet…" : stage === "confirming" ? "Confirming on Solana…" : `${mode === "buy" ? "Buy" : "Sell"} ${side.toUpperCase()}`}
          </Button>
          {publicConfig.solana.network === "devnet" && mode === "buy" && (
            <Button variant="ghost" size="sm" loading={busy === "faucet"} onClick={async () => { setBusy("faucet"); const r = await requestDevnetUsdc(chain.address!); push({ tone: r.ok ? "success" : "error", title: r.message }); setBusy(null); setTimeout(loadBalances, 4000); }}>
              Get 1,000 devnet mUSDC
            </Button>
          )}
        </>
      )}

      {last && (
        <p className="text-muted" data-testid="last-tx">
          Last transaction: <span className={cn(last.status === "FAILED" ? "text-rust" : last.status === "CONFIRMED" || last.status === "FINALIZED" ? "text-emerald-soft" : "text-amber")}>{last.status.toLowerCase()}</span>.{" "}
          <a href={explorerTxUrl(last.signature)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald hover:underline">Explorer <ExternalLink className="size-3.5" /></a>
        </p>
      )}

      {isAuthority && market.phase === "expired" && (
        <div className="space-y-2 border-t border-line pt-4">
          <p className="font-semibold text-fg">Settle as market authority</p>
          <p className="text-muted">PREDICT markets are resolved manually by their creator. This is your decision, signed by your wallet. Lockline recommendations are advisory and never trigger it.</p>
          <div className="flex gap-2">
            {(["yes", "no"] as const).map((s) => (
              <Button key={s} size="sm" variant={s === "yes" ? "secondary" : "danger"} loading={busy === `resolve-${s}`} onClick={async () => {
                if (!window.confirm(`Resolve this market on-chain as ${s.toUpperCase()}? This cannot be undone.`)) return;
                setBusy(`resolve-${s}`);
                try {
                  const sig = await resolvePredictMarket(chain.connection, chain.anchorWallet!, market.pda, s);
                  push(txMessage(await chain.recordTx(sig, "PREDICT_RESOLVE", intelproMarketId ?? undefined)));
                  router.refresh();
                } catch (e) {
                  push({ tone: "error", title: "Resolution not sent", body: e instanceof Error ? e.message : String(e) });
                } finally { setBusy(null); }
              }}>Resolve {s.toUpperCase()}</Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3"><span className="text-muted">{label}</span><span className="text-right text-fg">{value}</span></div>;
}
