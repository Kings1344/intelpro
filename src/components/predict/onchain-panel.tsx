"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { Anchor, ExternalLink, Rocket, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Notice, Mono } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { WalletButton } from "@/components/wallet/wallet-button";
import { api } from "@/lib/client/api";
import { MEMO_PROGRAM_ID, explorerTxUrl, explorerAddressUrl, publicConfig } from "@/lib/config";
import { shortAddress } from "@/lib/utils";
import { useChain, txMessage } from "./use-chain";
import { commitToVault, createCommitmentVault, createPredictMarket, launchVaultMarket, requestDevnetUsdc } from "@/lib/predict/client";

type Props = {
  marketId: string;
  isDemo: boolean;
  isCreator: boolean;
  signedIn: boolean;
  approved: boolean;
  improvedQuestion: string;
  deadline: string | null;
  criteriaHash: string | null;
  anchorSignature: string | null;
  predictMarketPda: string | null;
  linkedWallets: string[];
};

export function OnchainPanel(p: Props) {
  const router = useRouter();
  const { push } = useToast();
  const chain = useChain(p.linkedWallets);
  const [busy, setBusy] = useState<string | null>(null);
  const [deposit, setDeposit] = useState("50");
  const [priceBps, setPriceBps] = useState("5000");
  const [vault, setVault] = useState({ min: "200", window: "3600", address: "", side: "yes", amount: "25" });

  const ready = chain.address && chain.anchorWallet;
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      push({ tone: "error", title: "Action failed", body: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  async function anchor() {
    const { memo } = await api<{ memo: string }>(`/api/markets/${p.marketId}/anchor`, { method: "POST" });
    const payer = chain.wallet.publicKey!;
    const ix = new TransactionInstruction({ programId: new PublicKey(MEMO_PROGRAM_ID), keys: [{ pubkey: payer, isSigner: true, isWritable: false }], data: Buffer.from(memo, "utf8") });
    const tx = new Transaction().add(ix);
    const sig = await chain.wallet.sendTransaction(tx, chain.connection);
    const v = await chain.recordTx(sig, "CRITERIA_ANCHOR", p.marketId);
    push(txMessage(v));
    router.refresh();
  }

  async function launch() {
    if (!p.deadline) throw new Error("Market has no deadline.");
    const durationSecs = Math.floor((new Date(p.deadline).getTime() - Date.now()) / 1000);
    if (durationSecs < publicConfig.predict.minDurationSecs) throw new Error("The deadline is less than 5 minutes away; PREDICT requires at least 300 seconds.");
    const res = await createPredictMarket(chain.connection, chain.anchorWallet!, { name: p.improvedQuestion, durationSecs, initialPriceBps: Number(priceBps), depositUsdc: Number(deposit) });
    await api(`/api/markets/${p.marketId}/link-predict`, { body: { marketPda: res.marketPda, signature: res.signature, walletAddress: chain.address } });
    push({ tone: "success", title: "Launched on PREDICT and linked", body: `Market ${shortAddress(res.marketPda)}` });
    router.refresh();
  }

  if (p.isDemo) {
    return <Notice tone="neutral">Demonstration markets are not anchored or traded on-chain. Create your own market to use Solana features.</Notice>;
  }

  return (
    <div className="space-y-5 text-[13px]">
      {!p.signedIn ? (
        <Notice tone="steel">Sign in to use on-chain features.</Notice>
      ) : !chain.address ? (
        <div className="space-y-2">
          <p className="text-muted">Connect a Solana wallet ({publicConfig.solana.network}) to anchor rules and launch on PREDICT.</p>
          <WalletButton />
        </div>
      ) : !chain.linked ? (
        <Notice tone="amber">
          Wallet {shortAddress(chain.address)} is connected but not linked to your account. <Link href="/settings" className="underline">Link it in Settings</Link> so IntelPro can verify its transactions.
        </Notice>
      ) : null}

      <section className="space-y-2">
        <h3 className="flex items-center gap-2 font-semibold text-fg"><Anchor className="size-4 text-faint" /> Rules anchored on Solana</h3>
        {p.anchorSignature && p.criteriaHash ? (
          <div className="space-y-1">
            <p className="text-emerald-soft">Confirmed. The approved rules&apos; SHA-256 is recorded in a memo transaction.</p>
            <p><Mono>{shortAddress(p.criteriaHash, 10)}</Mono></p>
            <a className="inline-flex items-center gap-1 text-emerald hover:underline" href={explorerTxUrl(p.anchorSignature)} target="_blank" rel="noreferrer">View transaction <ExternalLink className="size-3.5" /></a>
          </div>
        ) : (
          <>
            <p className="text-muted">Write a tamper-evident fingerprint of the approved rules to Solana, so anyone can prove which rules traders agreed to.</p>
            <Button size="sm" disabled={!p.approved || !p.isCreator || !ready || !chain.linked} loading={busy === "anchor"} onClick={() => run("anchor", anchor)}>
              Anchor approved rules
            </Button>
            {!p.approved && <p className="text-faint">Approve the rules first.</p>}
          </>
        )}
      </section>

      <section className="space-y-2 border-t border-line pt-4">
        <h3 className="flex items-center gap-2 font-semibold text-fg"><Rocket className="size-4 text-faint" /> PREDICT pm-AMM market</h3>
        {p.predictMarketPda ? (
          <div className="space-y-1">
            <p className="text-emerald-soft">Linked to a live on-chain market.</p>
            <div className="flex flex-wrap gap-3">
              <Link href={`/markets/predict/${p.predictMarketPda}`} className="text-emerald hover:underline">Trade and view prices</Link>
              <a className="inline-flex items-center gap-1 text-muted hover:text-fg" href={explorerAddressUrl(p.predictMarketPda)} target="_blank" rel="noreferrer">Explorer <ExternalLink className="size-3.5" /></a>
            </div>
          </div>
        ) : (
          <>
            <p className="text-muted">Create a binary pm-AMM market with these rules as its name and the approved deadline as its expiry. Your wallet signs and seeds the liquidity in mUSDC.</p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Liquidity (mUSDC)" htmlFor="dep"><Input id="dep" type="number" min={1} value={deposit} onChange={(e) => setDeposit(e.target.value)} /></Field>
              <Field label="Initial YES price" htmlFor="bps">
                <Select id="bps" value={priceBps} onChange={(e) => setPriceBps(e.target.value)}>
                  {[1000, 2500, 5000, 7500, 9000].map((b) => <option key={b} value={b}>{b / 100}%</option>)}
                </Select>
              </Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="primary" disabled={!p.approved || !p.isCreator || !ready || !chain.linked} loading={busy === "launch"} onClick={() => run("launch", launch)}>Launch on PREDICT</Button>
              {chain.address && publicConfig.solana.network === "devnet" && (
                <Button size="sm" variant="ghost" loading={busy === "faucet"} onClick={() => run("faucet", async () => { const r = await requestDevnetUsdc(chain.address!); push({ tone: r.ok ? "success" : "error", title: r.message }); })}>Get devnet mUSDC</Button>
              )}
            </div>
          </>
        )}
      </section>

      {!p.predictMarketPda && (
        <details className="group border-t border-line pt-4">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-fg"><Users className="size-4 text-faint" /> Fund through a commitment vault</summary>
          <div className="mt-3 space-y-3">
            <p className="text-muted">A PREDICT commitment vault collects pledges first. The market launches only if the funding target is met, and committers become its liquidity providers.</p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Funding target (mUSDC)" htmlFor="vmin"><Input id="vmin" type="number" value={vault.min} onChange={(e) => setVault({ ...vault, min: e.target.value })} /></Field>
              <Field label="Commit window (seconds)" htmlFor="vwin"><Input id="vwin" type="number" min={60} value={vault.window} onChange={(e) => setVault({ ...vault, window: e.target.value })} /></Field>
            </div>
            <Button size="sm" disabled={!p.approved || !p.isCreator || !ready || !chain.linked || !p.deadline} loading={busy === "vault"} onClick={() => run("vault", async () => {
              const marketDurationSecs = Math.floor((new Date(p.deadline!).getTime() - Date.now()) / 1000) - Number(vault.window);
              const r = await createCommitmentVault(chain.connection, chain.anchorWallet!, { name: p.improvedQuestion, commitDurationSecs: Number(vault.window), marketDurationSecs, minTotalUsdc: Number(vault.min) });
              const v = await chain.recordTx(r.signature, "PREDICT_VAULT_COMMIT", p.marketId);
              setVault((s) => ({ ...s, address: r.vaultPda }));
              push({ ...txMessage(v), body: `Vault ${r.vaultPda}. Share this address so others can commit.` });
            })}>Create vault</Button>
            <div className="grid grid-cols-[minmax(0,1fr)_90px_90px] gap-2">
              <Field label="Vault address" htmlFor="vaddr"><Input id="vaddr" value={vault.address} onChange={(e) => setVault({ ...vault, address: e.target.value.trim() })} className="font-mono text-[12px]" /></Field>
              <Field label="Side" htmlFor="vside"><Select id="vside" value={vault.side} onChange={(e) => setVault({ ...vault, side: e.target.value })}><option value="yes">YES</option><option value="no">NO</option></Select></Field>
              <Field label="mUSDC" htmlFor="vamt"><Input id="vamt" type="number" value={vault.amount} onChange={(e) => setVault({ ...vault, amount: e.target.value })} /></Field>
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={!vault.address || !ready || !chain.linked} loading={busy === "commit"} onClick={() => run("commit", async () => {
                const sig = await commitToVault(chain.connection, chain.anchorWallet!, vault.address, vault.side as "yes" | "no", Number(vault.amount));
                push(txMessage(await chain.recordTx(sig, "PREDICT_VAULT_COMMIT", p.marketId)));
              })}>Commit</Button>
              <Button size="sm" variant="ghost" disabled={!vault.address || !ready || !chain.linked || !p.isCreator} loading={busy === "lvm"} onClick={() => run("lvm", async () => {
                const r = await launchVaultMarket(chain.connection, chain.anchorWallet!, vault.address);
                await api(`/api/markets/${p.marketId}/link-predict`, { body: { marketPda: r.marketPda, signature: r.signature, walletAddress: chain.address, viaVault: true } });
                push({ tone: "success", title: "Vault market launched and linked" });
                router.refresh();
              })}>Launch vault market</Button>
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
