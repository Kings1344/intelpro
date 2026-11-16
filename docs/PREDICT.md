# PREDICT pm-AMM integration

## Sources

Every convention below was verified against the official repository **sparkfun-labs/pm-amm at commit `d5b407b`** (15 Oct 2026). The repo includes the Anchor program, `@pm-amm/sdk` v0.2.0 source and the official Next.js app. File references are given so each claim can be re-checked.

## Devnet constants

| | Value |
|---|---|
| Program ID | `GV1FMGHRYBjQLaghE5fnGuYCuCcpdt3GD5xEX3TwN16y` (the same ID runs on mainnet with real USDC) |
| Collateral | mock USDC `3WQ8hCqTNwjrh8WzE2XyoZoUrd1miPcwWfMkmFPUMEWZ`, 6 decimals |
| Faucet | `POST https://pm-amm-devnet.vercel.app/api/faucet {"wallet": "<pubkey>"}`, 1,000 mUSDC per wallet per hour |
| Fee | `SWAP_FEE_BPS = 200`, split 50/50 between the DAO and the market creator (`sdk/src/constants.ts`, `anchor/.../swap.rs`) |

All of these are environment variables (`NEXT_PUBLIC_PM_AMM_*`).

## The four previously unclear details, now settled from source

| Question | Answer | Evidence |
|---|---|---|
| **1. Reserve encoding** | `lZero`, `reserveYes`, `reserveNo` and `cumYes/NoPerShare` are **I80F48 fixed-point**. Decode with `i80f48ToNumber` (÷ 2⁴⁸); the result is in **raw collateral base units**. Price = Φ((y − x) / L_eff) with **L_eff = L₀·√(endTs − lastAccrualTs)**. Reserves are only rebased on accrual, so pairing them with L_eff(now) mis-states the price. With zero reserves, the price falls back to `initialPriceBps`, then LP residuals, then 50%. | `sdk/src/math.ts` `i80f48ToNumber`; `app/src/hooks/use-markets.ts` |
| **2. Quote units** | **Raw base units** throughout. `send.swap(market, direction, amountInMicro, minOutputMicro)` takes raw units; `estimateSwapOutput` takes and returns raw units. YES/NO mints use the collateral's decimals (6). | `sdk/src/send.ts` header and `swap`; `anchor/.../initialize_market.rs` (`mint::decimals = collateral_mint.decimals`) |
| **3. Winning side** | `winningSide: u8`, **0 = unresolved, 1 = YES, 2 = NO**. | `anchor/programs/pm_amm/src/state.rs:56` |
| **4. Sell quotes** | The SDK has no sell helper. The program's YES→USDC branch is z′ = clamp(((y − x) − Δ) / L_eff, ±5.9); rebuild x′ = L·(z′Φ(z′) + φ(z′) − z′) and y′ = L·(z′Φ(z′) + φ(z′)); gross USDC = y − y′ (NO→USDC: z′ uses +Δ and gross = x − x′). Then **2% comes off the USDC output**. | `anchor/.../pm_math.rs` `compute_swap_output`; fee in `swap.rs` |

**A discrepancy we found in the official app.** Its client-side *fallback* sell quote (`app/src/hooks/use-swap-quote.ts`) calls `estimateSwapOutput` with the opposite side. That function returns a *token count* for a buy, so the fallback overstates sell proceeds by about 2× at mid prices. IntelPro instead ports the program's own formula (`src/lib/predict/quote.ts`). A unit test proves it lies on the pm-AMM invariant and documents the gap.

## How IntelPro quotes and trades

1. **Estimate** (`quote.ts`, pure, unit tested against the vendored SDK `math.ts`):
   - Buys use `estimateSwapOutput` on the post-fee input.
   - Sells use the program-formula port, with the fee taken off the output.
   - Validation covers zero amounts, balance, slippage bounds (0–50%) and unquotable markets.
2. **Simulate** (`client.ts → simulateQuote`): the exact `client.ix.swap` instruction is run through `simulateTransaction` (with idempotent ATA creation for the user, the DAO and the creator), and the post-balance of the output account is read. The program accrues first, so this is the authoritative output. If simulation can't run (e.g. no SOL for rent), the UI says it is showing an estimate.
3. **Execute**: `send.swap` with `minOutput = expected × (1 − slippage)`, so the program rejects any worse fill. A quote is only executed if its mode, side and amount match the form exactly; stale quotes are cleared on every input change.
4. **Confirm**: the signature is verified server-side (status, signer, pm-AMM program invoked) before the UI shows "confirmed".

Selling is fully wired: Buy/Sell tabs, live YES/NO/mUSDC balances (`getParsedTokenAccountsByOwner` for the market's mints), Max, slippage, signing and confirming states, and clear errors for wallet rejection and slippage.

## Module map

| Concern | Module |
|---|---|
| Discovery (server, no signing: `PmAmmClient.readOnly`) | `src/lib/predict/server.ts` |
| Account normalisation | `src/lib/predict/normalize.ts` |
| Quote math and validation | `src/lib/predict/quote.ts` |
| Browser: quote, simulate, swap, balances, create market, vaults, resolve, faucet | `src/lib/predict/client.ts` |
| Trade UI | `src/components/predict/trade-panel.tsx` |
| Launch, anchor, commitment vault UI | `src/components/predict/onchain-panel.tsx` |
| Transaction verification | `src/lib/services/transactions.ts`, `src/lib/solana/tx-verify.ts` |

## Verifying on devnet

Automated: `E2E_DEVNET=1 npm run test:e2e:devnet` (or the CI workflow with `devnet: true`). It generates a throwaway keypair, airdrops SOL, claims mUSDC, and then, through the real UI with a Wallet Standard test wallet:
1. links the wallet;
2. creates and approves a market;
3. launches it on PREDICT;
4. buys YES;
5. sells the whole YES balance;
6. checks that both swaps are recorded as confirmed.

**Not yet run.** The environment that built this had no access to Solana devnet or the npm registry, so this test has not run yet. See the technical report.

## Known limitations

- Expired and resolved markets: trading is disabled. Claiming winnings (`claimWinnings`) and LP actions are not in the IntelPro UI; use the official pm-AMM app.
- Commitment vaults: create, commit and launch are wired; refund and claim for committers are not.
- Trading volume is not exposed by the program, so IntelPro does not show it.
- The on-chain simulation needs the wallet to hold a little SOL for ATA rent; otherwise the estimate is shown and labelled.
