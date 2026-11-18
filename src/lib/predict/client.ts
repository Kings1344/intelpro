"use client";
/**
 * PREDICT pm-AMM — browser service. Every write is signed by the user's own
 * wallet through @solana/wallet-adapter; Lockline never holds keys.
 * Signatures, units and directions follow the official SDK reference
 * (packages/sdk/llms.txt in sparkfun-labs/pm-amm).
 */
import type { Connection } from "@solana/web3.js";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import { publicConfig } from "@/lib/config";
import { quoteSwap, type EstimateFn, type Mode, type Reserves, type Side, type SwapQuote } from "./quote";

export type { SwapQuote };

export type SwapDirection = "usdcToYes" | "usdcToNo" | "yesToUsdc" | "noToUsdc" | "yesToNo" | "noToYes";

async function makeClient(connection: Connection, wallet: AnchorWallet) {
  const [{ PmAmmClient }, { AnchorProvider }, { PublicKey }] = await Promise.all([
    import("@pm-amm/sdk"),
    import("@anchor-lang/core"),
    import("@solana/web3.js"),
  ]);
  // The wallet adapter's AnchorWallet satisfies AnchorProvider's wallet interface (publicKey + sign*).
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  return {
    client: PmAmmClient.fromProvider(provider, new PublicKey(publicConfig.predict.programId), new PublicKey(publicConfig.predict.usdcMint)),
    PublicKey,
  };
}

export const DECIMALS = publicConfig.predict.usdcDecimals; // YES/NO mints share the collateral's decimals

/**
 * Quote a buy or sell with the SDK's own pm-AMM math (`estimateSwapOutput`) and fee
 * constant (`SWAP_FEE_BPS`). All amounts are RAW base units, as the SDK and program use.
 * See src/lib/predict/quote.ts for the verified conventions.
 */
export async function quote(reserves: Reserves, input: { mode: Mode; side: Side; amountInRaw: number; slippageBps: number; balanceRaw?: number | null }): Promise<SwapQuote> {
  const [m, { SWAP_FEE_BPS }] = await Promise.all([import("@pm-amm/sdk/math"), import("@pm-amm/sdk")]);
  return quoteSwap({ estimateSwapOutput: m.estimateSwapOutput as EstimateFn, phi: m.phi, capitalPhi: m.capitalPhi }, reserves, { ...input, feeBps: SWAP_FEE_BPS });
}

/** `send.swap(market, direction, amountInMicro, minOutputMicro)`: raw units; the SDK creates missing ATAs and fee accounts. */
export async function swap(connection: Connection, wallet: AnchorWallet, marketPda: string, q: SwapQuote) {
  const { client, PublicKey } = await makeClient(connection, wallet);
  const sig: string = await client.send.swap(new PublicKey(marketPda), q.direction, q.amountInRaw, q.minOutRaw);
  return sig;
}

/**
 * Exact quote: simulate the real swap instruction against current chain state
 * (the program accrues first, so this reflects the post-accrual curve). Mirrors the
 * official app (app/src/hooks/use-swap-quote.ts `tryOnChainQuote`). Returns null when
 * simulation cannot run (e.g. no SOL for ATA rent); callers then fall back to the estimate.
 */
export async function simulateQuote(connection: Connection, owner: string, marketPda: string, m: { authority: string | null; collateralMint: string | null }, q: SwapQuote): Promise<number | null> {
  try {
    const [{ PmAmmClient, PROTOCOL_DAO }, web3, spl] = await Promise.all([import("@pm-amm/sdk"), import("@solana/web3.js"), import("@solana/spl-token")]);
    const { PublicKey, Transaction, ComputeBudgetProgram } = web3;
    const signer = new PublicKey(owner);
    const market = new PublicKey(marketPda);
    const collateralMint = new PublicKey(m.collateralMint ?? publicConfig.predict.usdcMint);
    if (!m.authority) return null;
    const creator = new PublicKey(m.authority);
    const client = PmAmmClient.readOnly(connection, new PublicKey(publicConfig.predict.programId), collateralMint);
    const yesMint = client.yesMint(market);
    const noMint = client.noMint(market);
    const ata = (mint: InstanceType<typeof PublicKey>, who: InstanceType<typeof PublicKey>) => spl.getAssociatedTokenAddressSync(mint, who, true);
    const create = (mint: InstanceType<typeof PublicKey>, who: InstanceType<typeof PublicKey>) => spl.createAssociatedTokenAccountIdempotentInstruction(signer, ata(mint, who), who, mint);
    const outMint = q.mode === "buy" ? (q.side === "yes" ? yesMint : noMint) : collateralMint;
    const outAta = ata(outMint, signer);

    const pre = [create(collateralMint, signer), create(yesMint, signer), create(noMint, signer), create(collateralMint, PROTOCOL_DAO)];
    if (!creator.equals(signer)) pre.push(create(collateralMint, creator));
    const ix = await client.ix.swap({ signer, market, direction: q.direction, amountIn: q.amountInRaw, minOutput: 0, creatorAuthority: creator, collateralMint });
    const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }), ...pre, ix);
    tx.feePayer = signer;
    tx.recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;

    const readAmount = (data: Uint8Array | null | undefined) => (data && data.length >= 72 ? Number(new DataView(data.buffer, data.byteOffset).getBigUint64(64, true)) : 0);
    const preInfo = await connection.getAccountInfo(outAta);
    const preBal = readAmount(preInfo?.data);
    const sim = await connection.simulateTransaction(tx, undefined, [outAta]);
    if (sim.value.err) return null;
    const acct = sim.value.accounts?.[0];
    if (!acct?.data) return null;
    const post = Uint8Array.from(atob(acct.data[0]), (c) => c.charCodeAt(0));
    const out = readAmount(post) - preBal;
    return out > 0 ? out : null;
  } catch {
    return null;
  }
}

export type Balances = { usdcRaw: number; yesRaw: number; noRaw: number };

/** Live wallet balances for the market's collateral and outcome tokens (raw units). */
export async function fetchBalances(connection: Connection, owner: string, mints: { usdc: string; yes: string | null; no: string | null }): Promise<Balances> {
  const { PublicKey } = await import("@solana/web3.js");
  const ownerKey = new PublicKey(owner);
  const sum = async (mint: string | null) => {
    if (!mint) return 0;
    const r = await connection.getParsedTokenAccountsByOwner(ownerKey, { mint: new PublicKey(mint) }, "confirmed");
    return r.value.reduce((acc, a) => acc + Number((a.account.data as { parsed: { info: { tokenAmount: { amount: string } } } }).parsed.info.tokenAmount.amount), 0);
  };
  const [usdcRaw, yesRaw, noRaw] = await Promise.all([sum(mints.usdc), sum(mints.yes), sum(mints.no)]);
  return { usdcRaw, yesRaw, noRaw };
}

/** `send.createMarket` takes human USDC. Duration must be ≥ 300 s; name 1–64 bytes. */
export async function createPredictMarket(connection: Connection, wallet: AnchorWallet, input: { name: string; durationSecs: number; initialPriceBps: number; depositUsdc: number }) {
  if (input.durationSecs < publicConfig.predict.minDurationSecs) throw new Error("PREDICT markets must last at least 300 seconds.");
  const name = truncateUtf8(input.name, 64);
  const { client } = await makeClient(connection, wallet);
  return (await client.send.createMarket({ ...input, name })) as { marketId: number; marketPda: string; signature: string };
}

/** Commitment vault: the market launches only if the funding target is met; committers become LPs. */
export async function createCommitmentVault(connection: Connection, wallet: AnchorWallet, input: { name: string; commitDurationSecs: number; marketDurationSecs: number; minTotalUsdc: number }) {
  if (input.commitDurationSecs < 60) throw new Error("Vault commit windows must be at least 60 seconds.");
  const { client } = await makeClient(connection, wallet);
  return (await client.send.createVault({ ...input, name: truncateUtf8(input.name, 64) })) as { vaultId: number; vaultPda: string; signature: string };
}

export async function commitToVault(connection: Connection, wallet: AnchorWallet, vaultPda: string, side: Side, amountUsdc: number) {
  const { client, PublicKey } = await makeClient(connection, wallet);
  return (await client.send.vaultCommit(new PublicKey(vaultPda), side, amountUsdc)) as string;
}

export async function launchVaultMarket(connection: Connection, wallet: AnchorWallet, vaultPda: string) {
  const { client, PublicKey } = await makeClient(connection, wallet);
  return (await client.send.launchVaultMarket(new PublicKey(vaultPda))) as { marketId: number; marketPda: string; signature: string };
}

/** Authority-only, after expiry. Always a deliberate human action — never triggered by AI output. */
export async function resolvePredictMarket(connection: Connection, wallet: AnchorWallet, marketPda: string, side: Side) {
  const { client, PublicKey } = await makeClient(connection, wallet);
  return (await client.send.resolveMarket(new PublicKey(marketPda), side)) as string;
}

/** Official devnet faucet: 1,000 mUSDC per wallet per hour (CORS enabled). */
export async function requestDevnetUsdc(wallet: string): Promise<{ ok: boolean; message: string }> {
  if (publicConfig.solana.network !== "devnet") return { ok: false, message: "The faucet is only available on devnet." };
  const res = await fetch(publicConfig.predict.faucetUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ wallet }),
  });
  if (res.status === 429) return { ok: false, message: "Faucet limit reached (one claim per wallet per hour)." };
  if (!res.ok) return { ok: false, message: `Faucet responded with HTTP ${res.status}.` };
  return { ok: true, message: "Faucet request accepted. mUSDC should arrive shortly." };
}

export function truncateUtf8(s: string, maxBytes: number) {
  const enc = new TextEncoder();
  let out = s.trim();
  while (enc.encode(out).length > maxBytes) out = out.slice(0, -1);
  return out || "Lockline market";
}
