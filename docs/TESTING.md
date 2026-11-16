# Testing

| Layer | Command | Needs | What it covers |
|---|---|---|---|
| Unit + integration | `npm test` | nothing (Node 20+) | 62 tests: Market Architect rules; integrity rules; evidence statuses; SSRF guard (incl. IPv4-mapped IPv6); quote grounding; traceability; resolution engine; base58; real ed25519 wallet proofs; criteria hashing; transaction verification fixtures; scrypt; keyed token hashing; email-token rules; E2E-mode gating; production config checks; RBAC; rate limiter; request validation; PDF validation and **real pdfjs extraction** on fixtures (text, image-only, damaged); PREDICT normaliser and quotes **against the vendored SDK math** (both directions, at 50% and skewed prices, invariant check, round-trip loss); the demo story. |
| Database | `npm run test:db` (`DATABASE_ADMIN_URL=postgresql://…/postgres`) | PostgreSQL | Applies every migration to a throwaway database, then checks uniqueness, enums, FKs, the URL-or-PDF CHECK constraint, cascades and audit preservation. |
| Type check | `npm run typecheck` | `npm install` | Strict TypeScript over app, tests and E2E. |
| Lint | `npm run lint` | `npm install` | ESLint 9 with `next/core-web-vitals` + `next/typescript`. |
| Browser E2E | `npm run build && npm run test:e2e` | built app, seeded PostgreSQL, Playwright Chromium (`npx playwright install chromium`) | See below. |
| Devnet E2E | `E2E_DEVNET=1 npm run test:e2e:devnet` | the above + Solana devnet + mUSDC faucet | Real launch → buy → sell through the UI. |
| Everything | GitHub Actions `.github/workflows/ci.yml` | a GitHub repo | install, migrate, **migration drift check**, seed, typecheck, lint, unit, DB, build, E2E (devnet on manual dispatch). |

## Browser E2E design

- **Real app, real database.** Playwright starts `next start` on port 3100 with `E2E_TEST_MODE=1` and `EMAIL_TRANSPORT=outbox`. Test mode is honoured only when `APP_URL` is localhost: it exposes `/api/test/outbox` so tests can follow real verification and reset links, and skips rate limits.
- **Test wallet** (`e2e/fixtures/test-wallet-page.js`): a Wallet Standard wallet injected into the page, signing with a fresh throwaway Ed25519 key via Web Crypto. It signs messages and transactions for real, and refuses transactions it is not a signer on. Message signing and legacy-transaction signing were verified in Chromium, with signatures checked by tweetnacl; the v0 message path is implemented but not yet exercised. No real key is ever used.
- **No AI key** in E2E, so the labelled rules engine is what's exercised.

| Spec | Journeys |
|---|---|
| `auth.spec.ts` | registration; unverified gating (API 403 + banner); resend; verification link; single-use links; revocation of older links; wrong password; invalid links; password reset end to end (validation, other sessions signed out, old password rejected, link reuse rejected); forgot-password gives no account-enumeration signal |
| `app.spec.ts` | dashboard consistency (stat = explorer row count); every sidebar section loads; market discovery filters and selection; live PREDICT tab never shows placeholder data; Market Architect flagging, inconsistent-rule blocking, approval; resolution recommendation |
| `evidence.spec.ts` | URL evidence submit → analyse (labelled heuristic, no YES/NO stance); SSRF rejection; PDF upload → extraction → download headers → analysis; scanned PDF reported unreadable; non-PDF rejected |
| `wallet.spec.ts` | connect; link by signed message (server-verified); portfolio live or explicit error; replayed signature refused; trading requires a linked wallet |
| `trading.spec.ts` | devnet only: airdrop, faucet, link, launch market on PREDICT, buy YES, sell all YES, both swaps confirmed |
| `responsive.spec.ts` | mobile (Pixel 7): no horizontal overflow on core pages; navigation drawer; Market Architect on a phone; error states (404, 401, missing records, health) |
