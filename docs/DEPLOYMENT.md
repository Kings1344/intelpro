# Deployment

IntelPro is a Next.js 15 (Node runtime) app with PostgreSQL. It builds as a standalone server (`output: "standalone"`) and ships with a Dockerfile. **It has not been deployed yet.** The steps below need your accounts; nothing here uses placeholder credentials.

## What you need to provide

| Item | Why | Where |
|---|---|---|
| PostgreSQL 14+ database | All data | Neon, Supabase, Railway, Render, RDS… |
| `SESSION_SECRET` | Keys session and email-token hashes | `openssl rand -hex 32` |
| Resend account: `RESEND_API_KEY` + verified sender `EMAIL_FROM` | Verification and password-reset emails. **The server refuses to start in production without them.** | resend.com |
| Public https origin for `APP_URL` | Email links, cookies, HSTS | Your host |
| Dedicated Solana devnet RPC (recommended) | PREDICT discovery uses `getProgramAccounts`, which public RPC rate-limits | Helius, Triton, QuickNode |
| `ANTHROPIC_API_KEY` (optional) | AI analysis. Without it, the labelled rules engine runs. | console.anthropic.com |

At boot, `src/instrumentation.ts` refuses to start a production server if:
- `SESSION_SECRET` is missing, short or still the example value;
- `APP_URL` isn't https;
- email isn't configured;
- `SEED_ADMIN_PASSWORD` is still the example value.

## Environment variables

See `.env.example`, which is the single reference with comments. Production minimum:

```
DATABASE_URL=postgresql://…
SESSION_SECRET=<64 hex chars>
APP_URL=https://<your-domain>
RESEND_API_KEY=re_…
EMAIL_FROM="IntelPro <no-reply@<your-domain>>"
SOLANA_RPC_URL=https://<dedicated devnet RPC>
NEXT_PUBLIC_SOLANA_RPC_URL=https://<browser-safe devnet RPC>
```

`NEXT_PUBLIC_*` values are compiled into the browser bundle at **build** time, so set them before building and put only public values there. Never set `E2E_TEST_MODE` on a deployment; it only works on localhost anyway.

## Option A: Docker (any host)

```bash
docker build -t intelpro \
  --build-arg NEXT_PUBLIC_SOLANA_NETWORK=devnet \
  --build-arg NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com .
docker run -p 3000:3000 --env-file .env.production intelpro   # runs `prisma migrate deploy`, then the server
docker run --rm --env-file .env.production intelpro npx prisma db seed   # optional, once: admin + demo data
```

The image runs as a non-root user and has a `HEALTHCHECK` on `/api/health`.

## Option B: Vercel

1. Import the repository. The build command is `npm run build` (runs `prisma generate`).
2. Add the environment variables (production and preview).
3. Apply migrations once per release: `DATABASE_URL=… npx prisma migrate deploy`, locally or as a CI step.
4. Seed once if you want the demo: `DATABASE_URL=… SEED_ADMIN_PASSWORD=<strong> npm run db:seed`.
5. Rate limits are per instance. For strict limits across instances, back `RateLimiter` with Upstash Redis.

## Database

```bash
npx prisma migrate deploy   # applies prisma/migrations (2 migrations)
npm run db:seed             # idempotent: admin (verified) + labelled demo markets
```

CI runs `prisma migrate diff --exit-code` against a shadow database to prove the hand-written migrations match `schema.prisma`. The `Evidence_url_required_for_url_kind` CHECK constraint lives in SQL only (Prisma doesn't model CHECK constraints).

## Security settings in place

- Headers: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, and HSTS when `APP_URL` is https.
- **CORS:** none is enabled. The API is same-origin only; cross-origin state-changing requests are rejected by an Origin check, and cookies are `SameSite=Lax`, httpOnly and Secure in production.
- Uploaded PDFs are served only as attachments, with `Content-Security-Policy: sandbox`.
- Errors: route errors return `{ error: { code, message } }` without stack traces; pages have error boundaries; logs are JSON with no tokens or passwords.

## Post-deploy checks

1. `GET /api/health` returns `status: ok`, `database: ok`, `migrationsApplied: 2` and `email: resend`.
2. `GET /api/predict/status` shows `reachable: true`.
3. Register a real account and follow the confirmation email. Then use “Forgot your password?” and follow the reset email.
4. Sign in as the seeded admin, change the password, and promote a reviewer in Settings.
5. Run the devnet journey in `docs/PREDICT.md` (automated: `E2E_DEVNET=1 npm run test:e2e:devnet` against a local build).
