/**
 * Normalises raw pm-AMM `MarketAccount` data (from @pm-amm/sdk `fetchAllMarkets`)
 * into Lockline's view model. Pure; math is injected (production: `@pm-amm/sdk/math`).
 *
 * Encodings verified against sparkfun-labs/pm-amm @ d5b407b:
 * - lZero, reserveYes, reserveNo, cumYes/NoPerShare: I80F48 fixed-point → `i80f48ToNumber`
 *   (raw collateral base units). SDK types/accounts.ts + app/src/hooks/use-markets.ts.
 * - Price: Φ((y − x) / L_eff) with L_eff = L₀·√(endTs − lastAccrualTs). Reserves are only
 *   rebased on accrual, so pairing them with L_eff(now) would mis-state the price.
 * - winningSide: u8, 0 = unresolved, 1 = YES, 2 = NO (anchor/programs/pm_amm/src/state.rs:56).
 * - Zero-reserve / expired fallbacks mirror the official app.
 */
export type PredictMarketView = {
  pda: string;
  marketId: number | null;
  name: string;
  authority: string | null;
  collateralMint: string | null;
  yesMint: string | null;
  noMint: string | null;
  vault: string | null;
  startTs: Date | null;
  endTs: Date | null;
  resolved: boolean;
  winningSide: "YES" | "NO" | null;
  yesPrice: number | null; // 0..1
  noPrice: number | null;
  priceSource: "reserves" | "initial_price" | "lp_residuals" | "resolution" | "default" | "unavailable";
  initialPriceBps: number | null;
  isGroupLeg: boolean;
  /** Raw-unit reserves and L_eff at last accrual, needed for client-side quoting. */
  reserveYes: number | null;
  reserveNo: number | null;
  lEff: number | null;
  phase: "open" | "expired" | "resolved";
};

export type MathFns = {
  i80f48ToNumber: (raw: { toString(): string } | bigint) => number;
  priceFromReserves: (x: number, y: number, lEff: number) => number;
};

type AnyObj = Record<string, unknown>;
const PUBKEY_DEFAULT = "11111111111111111111111111111111";

export function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string") return Number.isFinite(Number(v)) ? Number(v) : null;
  if (typeof v === "object" && typeof (v as { toString?: unknown }).toString === "function") {
    try {
      const n = Number(BigInt((v as { toString(): string }).toString()));
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function keyToString(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  const o = v as { toBase58?: () => string };
  return typeof o.toBase58 === "function" ? o.toBase58() : null;
}

export function decodeName(v: unknown): string {
  if (typeof v === "string") return v.replace(/\0+$/g, "").trim();
  if (Array.isArray(v) || v instanceof Uint8Array) {
    const bytes = Uint8Array.from(v as ArrayLike<number>);
    const end = bytes.indexOf(0);
    return new TextDecoder().decode(end === -1 ? bytes : bytes.slice(0, end)).trim();
  }
  return "";
}

/** u8 encoding from state.rs: 0 = unresolved, 1 = Yes, 2 = No. Anything else is reported as unknown. */
export function decodeSide(v: unknown): "YES" | "NO" | null {
  const n = typeof v === "number" ? v : toNum(v);
  return n === 1 ? "YES" : n === 2 ? "NO" : null;
}

const clampP = (p: number) => Math.max(0.001, Math.min(0.999, p));

export function normalizeMarket(pda: string, a: AnyObj, math: MathFns, now = new Date()): PredictMarketView {
  const nowSec = Math.floor(now.getTime() / 1000);
  const endSec = toNum(a.endTs) ?? 0;
  const startSec = toNum(a.startTs);
  const lastAccrual = toNum(a.lastAccrualTs) ?? nowSec;
  const resolved = Boolean(a.resolved);
  const winningSide = decodeSide(a.winningSide);
  const initialPriceBps = toNum(a.initialPriceBps) ?? 0;
  const expired = nowSec >= endSec;

  let reserveYes: number | null = null;
  let reserveNo: number | null = null;
  let lEff: number | null = null;
  let yesPrice: number | null = null;
  let priceSource: PredictMarketView["priceSource"] = "unavailable";
  try {
    const dec = (v: unknown) => math.i80f48ToNumber(v as { toString(): string });
    const lZero = dec(a.lZero);
    reserveYes = dec(a.reserveYes);
    reserveNo = dec(a.reserveNo);
    lEff = lZero * Math.sqrt(Math.max(endSec - lastAccrual, 1));
    if (resolved) {
      yesPrice = winningSide === "YES" ? 1 : winningSide === "NO" ? 0 : null;
      priceSource = yesPrice === null ? "unavailable" : "resolution";
    } else if (lEff > 0 && (reserveYes > 0 || reserveNo > 0)) {
      const p = math.priceFromReserves(reserveYes, reserveNo, lEff);
      yesPrice = Number.isFinite(p) ? (expired ? clampP(p) : p) : null;
      priceSource = yesPrice === null ? "unavailable" : "reserves";
    } else {
      const cumYes = a.cumYesPerShare !== undefined ? dec(a.cumYesPerShare) : 0;
      const cumNo = a.cumNoPerShare !== undefined ? dec(a.cumNoPerShare) : 0;
      if (initialPriceBps > 0 && cumYes + cumNo === 0) {
        yesPrice = initialPriceBps / 10_000;
        priceSource = "initial_price";
      } else if (cumYes + cumNo > 0) {
        yesPrice = cumNo / (cumYes + cumNo);
        priceSource = "lp_residuals";
      } else {
        yesPrice = 0.5;
        priceSource = "default";
      }
    }
  } catch {
    yesPrice = null;
    priceSource = "unavailable";
  }
  if (yesPrice !== null && !(yesPrice >= 0 && yesPrice <= 1)) {
    yesPrice = null;
    priceSource = "unavailable";
  }

  const group = keyToString(a.group);
  return {
    pda,
    marketId: toNum(a.marketId),
    name: decodeName(a.name) || `Market #${toNum(a.marketId) ?? "?"}`,
    authority: keyToString(a.authority),
    collateralMint: keyToString(a.collateralMint),
    yesMint: keyToString(a.yesMint),
    noMint: keyToString(a.noMint),
    vault: keyToString(a.vault),
    startTs: startSec ? new Date(startSec * 1000) : null,
    endTs: endSec ? new Date(endSec * 1000) : null,
    resolved,
    winningSide,
    yesPrice,
    noPrice: yesPrice === null ? null : 1 - yesPrice,
    priceSource,
    initialPriceBps: initialPriceBps || null,
    isGroupLeg: Boolean(group) && group !== PUBKEY_DEFAULT,
    reserveYes,
    reserveNo,
    lEff,
    phase: resolved ? "resolved" : expired ? "expired" : "open",
  };
}
