/**
 * PREDICT pm-AMM swap quoting. Pure module — unit tested against the SDK's own math.
 *
 * Verified against @pm-amm/sdk source (sparkfun-labs/pm-amm @ d5b407b, packages/sdk/src):
 * - Reserves and amounts are RAW base units (collateral decimals; YES/NO mints use the
 *   collateral's decimals — anchor initialize_market.rs `mint::decimals = collateral_mint.decimals`).
 * - `send.swap(market, direction, amountInMicro, minOutputMicro)` takes raw units.
 * - Fee: SWAP_FEE_BPS = 200 (constants.ts). Buys: fee comes off the INPUT, only the
 *   net trades the curve. Sells: fee comes off the USDC OUTPUT.
 * - Buy estimate: the SDK's `estimateSwapOutput` (same branches as the program's
 *   `compute_swap_output` for USDC→YES/NO).
 * - Sell estimate: the SDK has no sell helper, and the official app's client-side fallback
 *   (opposite-side `estimateSwapOutput`) returns an outcome-token count, overstating USDC.
 *   We therefore port the program's own YES/NO→USDC branch (anchor pm_math.rs
 *   `compute_swap_output`): z' = clamp(((y − x) ∓ Δ) / L_eff, ±5.9), rebuild
 *   x' = L·(z'Φ(z') + φ(z') − z'), y' = L·(z'Φ(z') + φ(z')); gross USDC = y − y' (YES) or x − x' (NO).
 * The program enforces `minOutput` on-chain, so a stale estimate can make a trade fail,
 * never fill below the user's minimum.
 */
export const SWAP_FEE_BPS = 200;

export type Side = "yes" | "no";
export type Mode = "buy" | "sell";
export type Reserves = { reserveYes: number; reserveNo: number; lEff: number };
export type EstimateFn = (reserveYes: number, reserveNo: number, lEff: number, amountIn: number, side: Side) => { output: number; priceAfter: number; priceImpact: number };
export type CurveFns = { estimateSwapOutput: EstimateFn; phi: (z: number) => number; capitalPhi: (z: number) => number };

const Z_CLAMP = 5.9; // pm_math.rs Z_CLAMP_LO / Z_CLAMP_HI

/** Port of the program's YES/NO → USDC branch of `compute_swap_output` (gross, before fee). */
export function estimateSellOutput(f: CurveFns, r: Reserves, amountIn: number, sideIn: Side) {
  const { reserveYes: x, reserveNo: y, lEff: L } = r;
  const zBefore = (y - x) / L;
  const zNew = Math.max(-Z_CLAMP, Math.min(Z_CLAMP, sideIn === "yes" ? zBefore - amountIn / L : zBefore + amountIn / L));
  const base = zNew * f.capitalPhi(zNew) + f.phi(zNew);
  const xn = L * (base - zNew);
  const yn = L * base;
  const output = sideIn === "yes" ? y - yn : x - xn;
  const before = f.capitalPhi(zBefore);
  const priceAfter = f.capitalPhi(zNew);
  return { output: Math.max(0, output), priceAfter, priceImpact: before > 0 ? Math.abs(priceAfter - before) / before : 0 };
}

export type SwapQuote = {
  mode: Mode;
  side: Side;
  direction: "usdcToYes" | "usdcToNo" | "yesToUsdc" | "noToUsdc";
  amountInRaw: number;
  expectedOutRaw: number;
  minOutRaw: number;
  feeRaw: number;
  priceImpact: number | null;
  priceAfter: number | null;
};

export class QuoteError extends Error {}

export function directionFor(mode: Mode, side: Side): SwapQuote["direction"] {
  if (mode === "buy") return side === "yes" ? "usdcToYes" : "usdcToNo";
  return side === "yes" ? "yesToUsdc" : "noToUsdc";
}

export function toRaw(human: number, decimals: number) {
  return Math.floor(human * 10 ** decimals + 1e-9);
}
export function fromRaw(raw: number, decimals: number) {
  return raw / 10 ** decimals;
}

export function quoteSwap(
  curve: CurveFns,
  reserves: Reserves,
  input: { mode: Mode; side: Side; amountInRaw: number; slippageBps: number; feeBps?: number; balanceRaw?: number | null },
): SwapQuote {
  const fee = input.feeBps ?? SWAP_FEE_BPS;
  const amount = Math.floor(input.amountInRaw);
  if (!Number.isFinite(amount) || amount <= 0) throw new QuoteError("Enter an amount greater than zero.");
  if (input.slippageBps < 0 || input.slippageBps > 5000) throw new QuoteError("Slippage must be between 0% and 50%.");
  if (!(reserves.lEff > 0) || !Number.isFinite(reserves.reserveYes) || !Number.isFinite(reserves.reserveNo))
    throw new QuoteError("This market's reserves cannot be quoted.");
  if (input.balanceRaw !== undefined && input.balanceRaw !== null && amount > input.balanceRaw)
    throw new QuoteError(input.mode === "sell" ? "Amount exceeds your token balance." : "Amount exceeds your mUSDC balance.");

  const netNum = 10_000 - fee;
  let expected: number;
  let feeRaw: number;
  let est: ReturnType<EstimateFn>;
  if (input.mode === "buy") {
    const netIn = Math.floor((amount * netNum) / 10_000);
    est = curve.estimateSwapOutput(reserves.reserveYes, reserves.reserveNo, reserves.lEff, netIn, input.side);
    expected = Math.floor(est.output);
    feeRaw = amount - netIn;
  } else {
    est = estimateSellOutput(curve, reserves, amount, input.side);
    const gross = Math.floor(est.output);
    expected = Math.floor((gross * netNum) / 10_000);
    feeRaw = gross - expected;
  }
  if (!Number.isFinite(expected) || expected <= 0) throw new QuoteError("This trade would return nothing at current reserves.");
  return {
    mode: input.mode,
    side: input.side,
    direction: directionFor(input.mode, input.side),
    amountInRaw: amount,
    expectedOutRaw: expected,
    minOutRaw: Math.floor((expected * (10_000 - input.slippageBps)) / 10_000),
    feeRaw,
    priceImpact: Number.isFinite(est.priceImpact) ? est.priceImpact : null,
    priceAfter: Number.isFinite(est.priceAfter) ? est.priceAfter : null,
  };
}
