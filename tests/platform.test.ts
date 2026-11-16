import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, hashToken, newSessionToken, passwordProblems } from "../src/lib/auth/password";
import { can, canApproveCriteria, canReviewDispute } from "../src/lib/auth/rbac";
import { RateLimiter } from "../src/lib/server/rate-limit";
import { createDisputeSchema, disputeActionSchema, evidenceInput, registerSchema } from "../src/lib/validation";

test("passwords hash with scrypt and verify in constant time", async () => {
  const h = await hashPassword("correct horse 42");
  assert.match(h, /^scrypt\$32768\$8\$1\$/);
  assert.equal(await verifyPassword("correct horse 42", h), true);
  assert.equal(await verifyPassword("wrong horse 42", h), false);
  assert.equal(await verifyPassword("x", "garbage"), false);
  assert.notEqual(h, await hashPassword("correct horse 42"), "salted");
  assert.deepEqual(passwordProblems("short"), ["Use at least 10 characters.", "Include letters and numbers."]);
});

test("session tokens are random and only their hash is stored", () => {
  const t = newSessionToken();
  assert.ok(t.length >= 43);
  assert.notEqual(t, newSessionToken());
  assert.match(hashToken(t), /^[0-9a-f]{64}$/);
});

test("role-based permissions", () => {
  assert.equal(can("USER", "market:create"), false);
  assert.equal(can("USER", "dispute:create"), true);
  assert.equal(can("MARKET_CREATOR", "dispute:review"), false);
  assert.equal(can("REVIEWER", "dispute:review"), true);
  assert.equal(can("ADMIN", "admin:users"), true);
  assert.equal(can(null, "evidence:submit"), false);
  assert.equal(canApproveCriteria({ id: "u1", role: "MARKET_CREATOR" }, { creatorId: "u2" }), false, "not own market");
  assert.equal(canApproveCriteria({ id: "u1", role: "MARKET_CREATOR" }, { creatorId: "u1" }), true);
  assert.equal(canApproveCriteria({ id: "u9", role: "ADMIN" }, { creatorId: "u1" }), true);
  assert.equal(canReviewDispute({ id: "r1", role: "REVIEWER" }, { challengerId: "r1" }), false, "no self-review");
});

test("rate limiter allows the limit then blocks until the window resets", () => {
  const rl = new RateLimiter(2, 1000);
  assert.equal(rl.check("k", 0).ok, true);
  assert.equal(rl.check("k", 10).ok, true);
  const blocked = rl.check("k", 20);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.retryAfterSec, 1);
  assert.equal(rl.check("k", 1001).ok, true);
  assert.equal(rl.check("other", 20).ok, true);
});

test("request validation rejects unsafe or malformed input", () => {
  assert.equal(registerSchema.safeParse({ name: "A", email: "x@y.z", password: "1234567890a" }).success, false, "name too short");
  assert.equal(evidenceInput.safeParse({ title: "Valid title", sourceName: "Src", sourceUrl: "javascript:alert(1)", description: "long enough description", category: "OTHER" }).success, false);
  assert.equal(evidenceInput.safeParse({ title: "Valid title", sourceName: "Src", sourceUrl: "https://example.com", description: "long enough description", category: "NOT_A_CATEGORY" }).success, false);
  assert.equal(createDisputeSchema.safeParse({ marketId: "m", reason: "too short" }).success, false);
  assert.equal(disputeActionSchema.safeParse({ action: "decide", decision: "UPHOLD", body: "short" }).success, false);
  assert.equal(disputeActionSchema.safeParse({ action: "decide", decision: "UPHOLD", body: "A sufficiently long reason." }).success, true);
});

import { classifyToken, looksLikeToken, TOKEN_TTL_MS, e2eTestMode } from "../src/lib/auth/token-rules";

test("auth tokens: single use, time limited, type bound, well formed", () => {
  const now = new Date("2026-11-16T12:00:00Z");
  const fresh = { type: "PASSWORD_RESET", expiresAt: new Date(now.getTime() + 60_000), usedAt: null };
  assert.equal(classifyToken(fresh, "PASSWORD_RESET", now), null);
  assert.equal(classifyToken(fresh, "EMAIL_VERIFICATION", now), "invalid", "a reset token cannot verify an email");
  assert.equal(classifyToken({ ...fresh, usedAt: now }, "PASSWORD_RESET", now), "used");
  assert.equal(classifyToken({ ...fresh, expiresAt: now }, "PASSWORD_RESET", now), "expired");
  assert.equal(classifyToken(null, "PASSWORD_RESET", now), "invalid");
  assert.equal(TOKEN_TTL_MS.PASSWORD_RESET, 30 * 60_000);
  assert.equal(TOKEN_TTL_MS.EMAIL_VERIFICATION, 24 * 3600_000);
  assert.equal(looksLikeToken(newSessionToken()), true);
  assert.equal(looksLikeToken("' OR 1=1 --"), false);
  assert.equal(looksLikeToken(undefined), false);
});

test("E2E test mode only activates on localhost", () => {
  const saved = { m: process.env.E2E_TEST_MODE, u: process.env.APP_URL };
  process.env.E2E_TEST_MODE = "1";
  process.env.APP_URL = "http://localhost:3000";
  assert.equal(e2eTestMode(), true);
  process.env.APP_URL = "https://intelpro.vercel.app";
  assert.equal(e2eTestMode(), false, "never on a real host");
  process.env.APP_URL = "http://localhost.evil.com";
  assert.equal(e2eTestMode(), false);
  process.env.E2E_TEST_MODE = "0";
  process.env.APP_URL = "http://localhost:3000";
  assert.equal(e2eTestMode(), false);
  process.env.E2E_TEST_MODE = saved.m;
  process.env.APP_URL = saved.u;
});

import { productionProblems } from "../src/lib/server/env-check";

test("production configuration checks catch unsafe deployments", () => {
  const good = { DATABASE_URL: "postgresql://x", SESSION_SECRET: "a".repeat(64), APP_URL: "https://intelpro.example", RESEND_API_KEY: "re_x", EMAIL_FROM: "IntelPro <no-reply@intelpro.example>" };
  assert.deepEqual(productionProblems(good), []);
  assert.ok(productionProblems({ ...good, SESSION_SECRET: "replace-with-64-hex-chars" }).some((p) => /SESSION_SECRET/.test(p)));
  assert.ok(productionProblems({ ...good, APP_URL: "http://intelpro.example" }).some((p) => /https/.test(p)));
  assert.ok(productionProblems({ ...good, RESEND_API_KEY: undefined }).some((p) => /RESEND/.test(p)));
  assert.ok(productionProblems({ ...good, SEED_ADMIN_PASSWORD: "change-me-now-123" }).some((p) => /SEED_ADMIN/.test(p)));
  assert.deepEqual(productionProblems({ ...good, APP_URL: "http://localhost:3100", RESEND_API_KEY: undefined, E2E_TEST_MODE: "1" }), [], "local E2E production build may run");
});

test("token hashes are keyed by SESSION_SECRET", () => {
  const saved = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "s".repeat(40);
  const a = hashToken("token-value");
  process.env.SESSION_SECRET = "t".repeat(40);
  assert.notEqual(hashToken("token-value"), a, "rotating the secret invalidates stored hashes");
  process.env.SESSION_SECRET = saved;
});
