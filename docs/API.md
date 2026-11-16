# IntelPro REST API

All endpoints live under `/api`. JSON in, JSON out.

- **Success:** `{ "data": … }` with 200.
- **Error:** `{ "error": { "code", "message", "details?" } }` with 400 (bad request), 401 (not signed in), 403 (forbidden), 404, 409 (conflict), 422 (validation / criteria not approvable), 429 (rate limited), 502 (Solana RPC unreachable) or 500.
- **Auth:** session cookie `intelpro_session` (httpOnly, SameSite=Lax), set by register/login.
- **Roles:** `USER`, `MARKET_CREATOR`, `REVIEWER`, `ADMIN`. The permission matrix is in `src/lib/auth/rbac.ts`.
- **Email verification:** permission-gated actions (create market, submit evidence, disputes, …) return **403 `email_unverified`** until the account's email is confirmed. Disable with `REQUIRE_EMAIL_VERIFICATION=false` for local experiments only.
- **CSRF:** state-changing requests carrying an `Origin` from another host are refused (403), in addition to SameSite=Lax cookies.
- **Rate limits** (per user or IP, per instance): auth 10 per 15 min, email 5/h, AI 20/h, evidence retrieval 30/h, PDF uploads 20/h, other writes 120/min.

## Authentication and users

| Method | Path | Auth | Body / notes |
|---|---|---|---|
| POST | `/auth/register` | — | `{ name, email, password }` (password ≥10 chars, letters + numbers). Creates a MARKET_CREATOR and signs in. |
| POST | `/auth/login` | — | `{ email, password }` |
| POST | `/auth/logout` | — | Clears the session. |
| GET | `/auth/me` | — | `{ user }` (includes `emailVerified`) or `{ user: null }` |
| POST | `/auth/verify-email` | — | `{ token }` from the emailed link. Single use, expires after 24 h. Errors: `problem` = `invalid` / `expired` / `used`. |
| POST | `/auth/resend-verification` | user | Sends a new link and revokes earlier ones. 5 per hour. |
| POST | `/auth/forgot-password` | — | `{ email }`. Always the same response (no account enumeration). Link expires after 30 min. |
| POST | `/auth/reset-password` | — | `{ token, password }`. Single use. Signs out every session and marks the email verified. |
| GET / PATCH | `/users/me` | user | PATCH `{ name }` |
| GET | `/admin/users` | admin | List users. |
| PATCH | `/admin/users/:id/role` | admin | `{ role }`. Audited; admins cannot demote themselves. |
| GET | `/audit?entityType=&entityId=` | admin | Audit log entries. |

## Markets and criteria

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/architect/analyze` | market:create | `{ question }` → ArchitectResult: `issues[]`, `improvedQuestion`, `yesCondition`, `noCondition`, `resolutionDeadline`, `dataSource`, `dataSourceUrl`, `methodology`, `clarityScore`, `scoreRationale`, `potentialDisputes[]`, `engine` (`AI`/`HEURISTIC`), `model`, `aiError`. Saves nothing. |
| GET | `/markets?q=&category=&status=&integrity=&resolves=7d\|30d\|90d\|past&demo=include\|exclude\|only` | — | List with integrity status. |
| POST | `/markets` | market:create | `{ category, description?, approve, criteria: { originalQuestion, improvedQuestion, yesCondition, noCondition, resolutionDeadline, timezone, dataSource, dataSourceUrl?, methodology, clarityScore, issues, engine, model? } }`. With `approve: true`, critical validation issues return 422 with `details` = issues. |
| GET | `/markets/:id` | — | Full detail: criteria versions, evidence + analyses, recommendations, disputes, activity, transactions, integrity. |
| POST | `/markets/:id/criteria` | creator of market / admin | `{ criteria, approve }` adds a new version (never overwrites). |
| POST | `/markets/:id/criteria/:criteriaId/approve` | creator / admin | Re-validates on the server, then approves. Clears any previous on-chain anchor. |
| GET | `/markets/:id/integrity` | — | `{ status, findings[{ rule, level, message }] }`, including a PREDICT end-time consistency check. |
| GET | `/integrity` | — | Integrity for all markets (same filters as `/markets`). |
| GET | `/dashboard` | — | Totals, integrity counts, evidence per day, Intelligence Feed, recent markets, activity. |

## Evidence

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/markets/:id/evidence` | — | Evidence with all analysis runs. |
| POST | `/markets/:id/evidence` | evidence:submit | `{ title, sourceName, sourceUrl, description, publishedAt?, category, claimedStance }`. Status starts as `SUBMITTED`. Private/internal URLs are rejected. |
| POST | `/markets/:id/evidence/pdf` | evidence:submit | `multipart/form-data`: `file` (PDF, ≤10 MB, `%PDF` magic bytes checked) + `title, sourceName, description, category, claimedStance, publishedAt?, sourceUrl?`. Extracts the text layer immediately: status `ACCESSIBLE` (text read) or `UNABLE_TO_VERIFY` with the reason (scanned / encrypted / damaged). Returns `{ id, status, extraction: { status, pageCount, chars, reason } }`. 413 / 415 for oversize / non-PDF. |
| GET | `/evidence/:id/file` | — | Downloads the uploaded PDF as an attachment (`content-disposition: attachment`, CSP sandbox, nosniff). |
| POST | `/evidence/:id/analyze` | evidence:analyse | Runs retrieval → accessibility → extraction → comparison → grounded claims → summary → store, then recomputes corroborated/contradicted statuses. Returns `{ analysis, status, note }`. Demo evidence is never re-fetched. |

## Resolution

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/markets/:id/recommendations` | — | History. |
| POST | `/markets/:id/recommendations` | resolution:generate | Requires approved criteria. Output: `recommendation`, `confidence`, `reasoning`, `uncertainty`, `missingInformation[]`, `citedEvidenceIds[]` (validated against stored evidence), `rejectedCitations[]`, `engine`, `model`. Never changes market status. |
| POST | `/markets/:id/propose` | market:propose_resolution | `{ outcome: "YES"\|"NO", recommendationId }`. Only after the deadline and with no open dispute. Sets `RESOLUTION_PROPOSED`; not on-chain settlement. |

## Disputes

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/disputes?status=` | — | |
| POST | `/disputes` | dispute:create | `{ marketId, recommendationId?, reason (≥20), evidence?[] (≤5) }`. A proposed market moves to `DISPUTED`; reviewers are notified. |
| GET | `/disputes/:id` | — | Detail, comments, attached evidence, audit entries. |
| POST | `/disputes/:id/actions` | see below | `{ action: "start_review" }` reviewer · `{ action: "comment", body }` parties/reviewers · `{ action: "request_evidence", body }` reviewer · `{ action: "add_evidence", evidence }` challenger/reviewer · `{ action: "decide", decision: "UPHOLD"\|"REJECT", body }` reviewer. A reviewer can never act on their own challenge. UPHOLD withdraws the proposed outcome; REJECT lets it stand. |

## Wallets and transactions

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/wallet/nonce` | user | `{ address }` → `{ nonce, message }` (single use, 10 min). |
| POST | `/wallet/verify` | user | `{ address, nonce, signature (base64 ed25519 over message) }` → links the wallet. |
| GET | `/wallet` · DELETE `/wallet/:address` | user | |
| POST | `/markets/:id/anchor` | creator / admin | Returns `{ memo, hash, version, memoProgramId }` to sign with the SPL Memo program. |
| POST | `/transactions` | user | `{ signature, kind, marketId?, walletAddress }`. kind ∈ `CRITERIA_ANCHOR, WALLET_TEST, PREDICT_SWAP, PREDICT_CREATE_MARKET, PREDICT_VAULT_COMMIT, PREDICT_RESOLVE`. Verifies on-chain status, signer, program and (for anchors) the exact memo. A successful anchor sets the market's `criteriaHash`. |
| POST | `/transactions/:signature/refresh` | owner | Re-verify against the cluster. |
| GET | `/transactions` | user | |
| POST | `/markets/:id/link-predict` | creator | `{ marketPda, signature, walletAddress, viaVault? }`. Requires a confirmed pm-AMM transaction from the user's verified wallet, and (unless vault-launched) on-chain authority = that wallet. |

## PREDICT, portfolio, notifications

| Method | Path | Notes |
|---|---|---|
| GET | `/predict/markets?expired=1&refresh=1` | Live discovery via `fetchAllMarkets(443)`, plus vault liquidity. `status.reachable` is false on failure; no data is ever simulated. |
| GET | `/predict/markets/:pda` | One live market, plus the linked IntelPro market. |
| GET | `/predict/status` | Program, mint, reachability, counts. |
| GET | `/portfolio` (user) | Per linked wallet: SOL, mUSDC, YES/NO positions (token accounts matched to PREDICT mints), recent signatures; recorded transactions; participation. |
| GET / PATCH | `/notifications` (user) | PATCH `{ ids?: [], all?: true }` marks read. |
| GET | `/health` | `{ status, database, migrationsApplied, ai, email, solanaNetwork }`, 503 if the database is unreachable. |
| GET | `/test/outbox?to=` | **E2E only.** 404 unless `E2E_TEST_MODE=1` and `APP_URL` is localhost. |
