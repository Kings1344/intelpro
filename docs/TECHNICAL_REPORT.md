# IntelPro technical report

Status as of 16 November 2026 (second completion pass).

## Read this first: what was and wasn't possible here

The environment used to build IntelPro **cannot reach the npm registry or Solana devnet**. It *can* reach GitHub over git, which made it possible to read the official pm-AMM program, SDK and app source.

So these steps **have not been run yet**:
- `npm install`
- `npm run typecheck` with real type packages
- `npm run lint`
- `next build`
- the Playwright suite against the real app
- any devnet transaction

Everything needed to run them is written and committed: dependencies, ESLint config, Playwright config and specs, a GitHub Actions workflow and a Dockerfile.

**The fastest way to close the gap** is to push the repository to GitHub. The CI workflow then installs, migrates, checks migration drift, seeds, type-checks, lints, runs unit, DB and E2E tests, and builds. A manual "devnet" run executes the real launch → buy → sell journey with a throwaway wallet.

Nothing in this report is claimed as working unless the "Verified here" column says so.

## Features completed

| Feature | State | Verified here |
|---|---|---|
| **PREDICT conventions** (reserve encoding, quote units, winning side, sell quotes) | Settled from program, SDK and app source; normaliser and quoting rewritten. Two earlier bugs fixed: quotes in human instead of raw units, and price using L_eff(now) instead of L_eff(lastAccrual). | Yes: 10 tests against the vendored, unmodified SDK `math.ts`, incl. the invariant check and a skewed-price test |
| **Selling** | Buy/Sell tabs, live balances, Max, slippage, on-chain-simulated quotes with a labelled fallback estimate, stale-quote protection, signing and confirming states, wallet-rejection and slippage errors | Quote math: yes. UI: rendered in Chromium with the real SDK math. A stale-quote bug was found visually and fixed. Execution on devnet: **no** |
| **Email verification** | Tokens (24 h, single use, revoke-on-reissue, HMAC-stored); verify page; resend banner; permission-gated actions return 403 `email_unverified` | Token rules: yes. DB constraints: yes. Flow: E2E written, **not run** |
| **Password reset** | 30-min single-use link; enumeration-safe request; new password validated; all sessions revoked; email marked verified | As above |
| **Email delivery** | Resend (production), console log (dev), outbox (local E2E only). Production refuses non-Resend transports. | Mode gating: yes. Resend API call: **no** (needs your key) |
| **PDF evidence** | Upload (≤10 MB, magic bytes, sanitised name), pdfjs text extraction per page, scanned / encrypted / damaged detection with exact reasons, DB storage, attachment-only download, analysis via the existing grounded pipeline, UI with processing states | Validation and **real pdfjs extraction** on text, image-only and damaged fixtures: yes. Grounding on extracted text: yes. Upload route and UI: rendered, route **not run** |
| **Browser E2E suite** | 6 specs, ~20 journeys (see TESTING.md); Wallet Standard test wallet signing with Web Crypto Ed25519 | Test wallet: yes (message and legacy-tx signatures verified in Chromium; foreign tx refused). Specs: written and type-checked against stubs; **not run** |
| **Security hardening** | Origin check on mutations; HMAC token hashing with `SESSION_SECRET` (previously required but unused); enum-validated query parameters; truncated error logs; fail-fast production config check; HSTS; root error boundary; health check with migration count | Config checks, token keying, SSRF: yes |
| **Deployment** | `output: "standalone"`, Dockerfile (non-root, healthcheck, migrate-on-start), CI workflow, complete `.env.example` | Workflow and package.json parse: yes. Docker build: **no** |
| **AI fallback** | Unchanged and preserved: without a key, every result is labelled "Heuristic engine, not AI"; the heuristic never assigns YES/NO to evidence; E2E runs with no key to exercise this | Yes (unit tests and rendered UI) |

## Tests

| Suite | Result |
|---|---|
| `npm test` | **62 / 62 pass** (was 44): +7 PREDICT normaliser and quote tests against the SDK math, +5 PDF tests (real pdfjs), +6 auth, config and E2E-mode tests |
| `scripts/test-db.sh` on PostgreSQL 16 | **Pass.** Both migrations apply; 12 constraint checks pass, including token-hash uniqueness, the URL-or-PDF CHECK, one file per evidence row, new users starting unverified, and cascades for tokens and files. |
| Strict `tsc` with stubbed external types | Only stub artifacts remain (inference through the `any` Prisma client, plus one missing stub export). Found and fixed real bugs: a deleted `makeClient` helper (would have broken every trade and vault call), and an unsupported pdfjs option. |
| Visual QA in Chromium (preview harness with real components and real Tailwind build) | Overview, Market Architect, evidence, PDF upload, buy and sell panels, mobile layouts render correctly. Found and fixed: stale buy quote shown on the sell tab and executable. |
| ESLint | **Not run** (package unavailable here) |
| Playwright E2E | **Not run** |
| `next build` | **Not run** |
| Devnet trading | **Not run** |

**Tests that failed:** none of the suites that could run are failing. During this pass, two sell-quote tests failed and exposed that the official app's fallback sell estimate is wrong; IntelPro now ports the program's formula. One visual check exposed the stale-quote bug. Both are fixed.

## Remaining external dependencies

| Dependency | Needed for |
|---|---|
| npm registry access, or GitHub CI | install, typecheck, lint, build, E2E |
| Solana devnet RPC + mUSDC faucet | trading, anchoring, discovery, devnet E2E |
| Resend account (`RESEND_API_KEY`, verified `EMAIL_FROM`) | production email; the server will not start in production without it |
| PostgreSQL host | production database |
| Anthropic API key | optional, for AI analysis |

## Known limitations

- PREDICT: no claim-winnings, LP deposit/withdraw, vault refund/claim or multi-outcome UI (use the official app). Volume isn't shown because the program doesn't expose it. Simulated quotes need a little SOL for ATA rent; otherwise the labelled estimate is used.
- PDFs: no OCR, so scanned PDFs are stored and reported unreadable. Limits are 10 MB and 300 pages, stored in PostgreSQL.
- Rate limiting is in-memory per instance.
- The dispute process is IntelPro's reviewed workflow, not on-chain arbitration.
- No Content-Security-Policy header yet: the wallet adapter and Next inline scripts need a nonce-based CSP, which has to be tested in a real build.

## Exact deployment steps

1. Push the repo to GitHub and let CI pass. Run it manually with `devnet: true` once to verify trading.
2. Create PostgreSQL, a Resend sender and (recommended) a dedicated devnet RPC.
3. Set the production environment from `.env.example` (see `DEPLOYMENT.md`).
4. Deploy with Docker (`docker build … && docker run …`; migrations run on start) or on Vercel (`prisma migrate deploy` once per release).
5. Seed once with a strong `SEED_ADMIN_PASSWORD` if you want the demo.
6. Run the post-deploy checks in `DEPLOYMENT.md`.

## Manual actions still required from you

1. **Connect GitHub** (claude.ai Settings → Connectors) and ask for a push, or push the zip yourself. That gives a real install, lockfile, build, lint, E2E and devnet run.
2. Commit the `package-lock.json` produced by the first `npm install`.
3. Provide production credentials: database, `SESSION_SECRET`, Resend key and sender, RPC, and optionally Anthropic.
4. Fix anything the first real build or E2E run surfaces. The most likely areas are third-party type definitions (Prisma payloads, the SDK's own `.d.ts`) and selector details in E2E specs written against unrun UI.
