/**
 * PREDICT pm-AMM conventions, verified against the SDK's own math
 * (tests/fixtures/pm-amm-sdk-math.ts = unmodified @pm-amm/sdk src/math.ts @ d5b407b).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as sdk from "./fixtures/pm-amm-sdk-math";
import { quoteSwap as quoteWith, estimateSellOutput, QuoteError, toRaw, fromRaw, directionFor, SWAP_FEE_BPS } from "../src/lib/predict/quote";

const curve = { estimateSwapOutput: sdk.estimateSwapOutput, phi: sdk.phi, capitalPhi: sdk.capitalPhi };
const quoteSwap = (_e: unknown, r: Parameters<typeof quoteWith>[1], i: Parameters<typeof quoteWith>[2]) => quoteWith(curve, r, i);
import { normalizeMarket, decodeSide, decodeName, toNum } from "../src/lib/predict/normalize";

const math = { i80f48ToNumber: sdk.i80f48ToNumber, priceFromReserves: sdk.priceFromReserves };
const Q = BigInt(1) << BigInt(48);
const i80 = (n: number) => ({ toString: () => (BigInt(Math.round(n)) * Q).toString() }); // BN-like I80F48
const bn = (n: number) => ({ toString: () => String(Math.round(n)) });
const pk = (s: string) => ({ toBase58: () => s });

// A balanced market seeded with 50 mUSDC (raw units): pm-AMM reserves at P=0.5 are x = y = L·φ(0).
const NOW = new Date("2026-11-16T00:00:00Z");
const nowSec = NOW.getTime() / 1000;
const remaining = 3600;
const lZero = 50_000_000 / (sdk.phi(0) * Math.sqrt(remaining));
const reserves = { reserveYes: lZero * Math.sqrt(remaining) * sdk.phi(0), reserveNo: lZero * Math.sqrt(remaining) * sdk.phi(0), lEff: lZero * Math.sqrt(remaining) };

const account = (o: Record<string, unknown> = {}) => ({
  marketId: bn(42), name: Array.from(new TextEncoder().encode("Will X happen?\0\0")), authority: pk("Auth"), collateralMint: pk("Mint"), yesMint: pk("Yes"), noMint: pk("No"), vault: pk("Vault"),
  startTs: bn(nowSec - 100), endTs: bn(nowSec + remaining), lastAccrualTs: bn(nowSec), lZero: { toString: () => BigInt(Math.round(lZero * 2 ** 48)).toString() },
  reserveYes: { toString: () => BigInt(Math.round(reserves.reserveYes * 2 ** 48)).toString() }, reserveNo: { toString: () => BigInt(Math.round(reserves.reserveNo * 2 ** 48)).toString() },
  cumYesPerShare: i80(0), cumNoPerShare: i80(0), resolved: false, winningSide: 0, initialPriceBps: 5000, group: pk("11111111111111111111111111111111"), ...o,
});

test("I80F48 decoding uses the SDK's 2^48 scale (not Number(bn)/1e6)", () => {
  assert.equal(sdk.i80f48ToNumber(i80(1_000_000)), 1_000_000);
  assert.ok(Math.abs(sdk.i80f48ToNumber({ toString: () => (BigInt(3) * Q / BigInt(2)).toString() }) - 1.5) < 1e-12);
});

test("normaliser: balanced market prices at 50% from reserves", () => {
  const m = normalizeMarket("Pda", account(), math, NOW);
  assert.equal(m.name, "Will X happen?");
  assert.equal(m.priceSource, "reserves");
  assert.ok(Math.abs(m.yesPrice! - 0.5) < 1e-6);
  assert.ok(Math.abs(m.lEff! - reserves.lEff) / reserves.lEff < 1e-9);
  assert.equal(m.phase, "open");
  assert.equal(m.isGroupLeg, false);
});

test("normaliser: L_eff is taken at lastAccrualTs, not now", () => {
  const stale = normalizeMarket("Pda", account({ lastAccrualTs: bn(nowSec - 1800) }), math, NOW);
  assert.ok(Math.abs(stale.lEff! - lZero * Math.sqrt(remaining + 1800)) < 1e-3);
});

test("normaliser: winning side u8 — 1 = YES, 2 = NO, 0 = unresolved (state.rs)", () => {
  assert.equal(decodeSide(1), "YES");
  assert.equal(decodeSide(2), "NO");
  assert.equal(decodeSide(0), null);
  assert.equal(decodeSide(7), null);
  const yes = normalizeMarket("P", account({ resolved: true, winningSide: 1 }), math, NOW);
  assert.deepEqual([yes.phase, yes.winningSide, yes.yesPrice, yes.priceSource], ["resolved", "YES", 1, "resolution"]);
  assert.equal(normalizeMarket("P", account({ resolved: true, winningSide: 2 }), math, NOW).yesPrice, 0);
});

test("normaliser: zero reserves fall back to the seed price, then LP residuals, then 50/50", () => {
  const z = { reserveYes: i80(0), reserveNo: i80(0) };
  const seeded = normalizeMarket("P", account({ ...z, initialPriceBps: 7000 }), math, NOW);
  assert.deepEqual([seeded.yesPrice, seeded.priceSource], [0.7, "initial_price"]);
  const residual = normalizeMarket("P", account({ ...z, initialPriceBps: 0, cumYesPerShare: i80(1), cumNoPerShare: i80(3) }), math, NOW);
  assert.deepEqual([residual.yesPrice, residual.priceSource], [0.75, "lp_residuals"]);
  assert.equal(normalizeMarket("P", account({ ...z, initialPriceBps: 0 }), math, NOW).priceSource, "default");
  assert.equal(normalizeMarket("P", account({ endTs: bn(nowSec - 1) }), math, NOW).phase, "expired");
  assert.equal(decodeName("plain"), "plain");
  assert.equal(toNum({ toString: () => "not a number" }), null);
});

test("buy quote: fee comes off the input; output equals the SDK estimate on the net amount", () => {
  const amount = toRaw(10, 6);
  const q = quoteSwap(sdk.estimateSwapOutput, reserves, { mode: "buy", side: "yes", amountInRaw: amount, slippageBps: 200 });
  const net = Math.floor((amount * (10_000 - SWAP_FEE_BPS)) / 10_000);
  assert.equal(q.direction, "usdcToYes");
  assert.equal(q.feeRaw, amount - net);
  assert.equal(q.expectedOutRaw, Math.floor(sdk.estimateSwapOutput(reserves.reserveYes, reserves.reserveNo, reserves.lEff, net, "yes").output));
  assert.ok(q.expectedOutRaw > net, "at 50% a YES token costs < 1 mUSDC, so you get more tokens than mUSDC spent");
  assert.equal(q.minOutRaw, Math.floor((q.expectedOutRaw * 9800) / 10_000));
  assert.ok(q.priceAfter! > 0.5, "buying YES raises the YES price");
});

test("sell quote: opposite-side estimate on the token amount, fee off the output", () => {
  const tokens = toRaw(10, 6);
  const q = quoteSwap(sdk.estimateSwapOutput, reserves, { mode: "sell", side: "yes", amountInRaw: tokens, slippageBps: 100 });
  const gross = Math.floor(estimateSellOutput(curve, reserves, tokens, "yes").output);
  assert.equal(q.direction, "yesToUsdc");
  assert.equal(q.expectedOutRaw, Math.floor((gross * 9800) / 10_000));
  assert.equal(q.feeRaw, gross - q.expectedOutRaw);
  assert.ok(q.expectedOutRaw < tokens, "selling YES at ~50% returns less mUSDC than tokens sold");
  assert.ok(q.priceAfter! < 0.5, "selling YES lowers the YES price");
  assert.equal(directionFor("sell", "no"), "noToUsdc");
});

test("sell formula matches the program invariant: removed reserves stay on the pm-AMM curve", () => {
  const tokens = toRaw(10, 6);
  const r = estimateSellOutput(curve, reserves, tokens, "yes");
  // After a YES sell, z' = z − Δ/L; both rebuilt reserves lie on the invariant x' = y' − L·z'.
  const z = (reserves.reserveNo - reserves.reserveYes) / reserves.lEff - tokens / reserves.lEff;
  const base = z * sdk.capitalPhi(z) + sdk.phi(z);
  assert.ok(Math.abs(r.output - (reserves.reserveNo - reserves.lEff * base)) < 1e-6);
  // Selling 10 YES at ~50% must return roughly 10 × 0.5 mUSDC (minus impact), never more than 10.
  assert.ok(r.output > 0.45 * tokens && r.output < 0.5 * tokens, `gross ${r.output}`);
  // The official app's fallback (opposite-side buy estimate) returns a token count, roughly 2× the program's USDC.
  const appFallback = sdk.estimateSwapOutput(reserves.reserveYes, reserves.reserveNo, reserves.lEff, tokens, "no").output;
  assert.ok(appFallback > 1.8 * r.output, "documents why the app fallback is not used");
});

test("round trip loses value to fees and curve impact (no free money)", () => {
  const spend = toRaw(25, 6);
  const buy = quoteSwap(sdk.estimateSwapOutput, reserves, { mode: "buy", side: "no", amountInRaw: spend, slippageBps: 0 });
  const sell = quoteSwap(sdk.estimateSwapOutput, reserves, { mode: "sell", side: "no", amountInRaw: buy.expectedOutRaw, slippageBps: 0 });
  assert.ok(sell.expectedOutRaw < spend);
  assert.ok(fromRaw(spend - sell.expectedOutRaw, 6) >= 0.5 * 0.99, "at least ~2% of 25 mUSDC is lost to fees");
});

test("quote validation: zero, balance, slippage and unquotable markets", () => {
  assert.throws(() => quoteSwap(sdk.estimateSwapOutput, reserves, { mode: "buy", side: "yes", amountInRaw: 0, slippageBps: 100 }), QuoteError);
  assert.throws(() => quoteSwap(sdk.estimateSwapOutput, reserves, { mode: "sell", side: "yes", amountInRaw: 5_000_000, slippageBps: 100, balanceRaw: 1_000_000 }), /exceeds your token balance/);
  assert.throws(() => quoteSwap(sdk.estimateSwapOutput, reserves, { mode: "buy", side: "yes", amountInRaw: 1_000_000, slippageBps: 9000 }), /Slippage/);
  assert.throws(() => quoteSwap(sdk.estimateSwapOutput, { reserveYes: 0, reserveNo: 0, lEff: 0 }, { mode: "buy", side: "yes", amountInRaw: 1_000_000, slippageBps: 100 }), /cannot be quoted/);
  assert.equal(toRaw(0.000001, 6), 1);
  assert.equal(toRaw(1.1, 6), 1_100_000);
});

test("quotes at a skewed price (YES ≈ 61.8%) move the price the right way and value tokens near the price", () => {
  const z = 0.3;
  const L = reserves.lEff;
  const base = z * sdk.capitalPhi(z) + sdk.phi(z);
  const skewed = { reserveYes: L * (base - z), reserveNo: L * base, lEff: L };
  const p0 = sdk.priceFromReserves(skewed.reserveYes, skewed.reserveNo, L);
  const tokens = toRaw(18.42, 6);
  const sellYes = quoteSwap(null, skewed, { mode: "sell", side: "yes", amountInRaw: tokens, slippageBps: 200 });
  assert.ok(sellYes.priceAfter! < p0, "selling YES lowers the YES price");
  const perToken = (sellYes.expectedOutRaw + sellYes.feeRaw) / tokens;
  assert.ok(perToken < p0 && perToken > p0 - 0.03, `YES sells just below the ${p0.toFixed(3)} price (got ${perToken.toFixed(3)})`);
  const sellNo = quoteSwap(null, skewed, { mode: "sell", side: "no", amountInRaw: tokens, slippageBps: 200 });
  assert.ok(sellNo.priceAfter! > p0, "selling NO raises the YES price");
  const perNo = (sellNo.expectedOutRaw + sellNo.feeRaw) / tokens;
  assert.ok(perNo < 1 - p0 && perNo > 1 - p0 - 0.03, `NO sells just below ${(1 - p0).toFixed(3)}`);
  const buyYes = quoteSwap(null, skewed, { mode: "buy", side: "yes", amountInRaw: toRaw(10, 6), slippageBps: 200 });
  assert.ok(buyYes.priceAfter! > p0, "buying YES raises the YES price");
  assert.ok(toRaw(9.8, 6) / buyYes.expectedOutRaw > p0, "each YES token costs at least the current price");
});
