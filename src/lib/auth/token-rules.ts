/** Pure token rules (unit tested). */
export type TokenType = "EMAIL_VERIFICATION" | "PASSWORD_RESET";
export type TokenProblem = "invalid" | "expired" | "used";

export const TOKEN_TTL_MS: Record<TokenType, number> = {
  EMAIL_VERIFICATION: 24 * 3600e3,
  PASSWORD_RESET: 30 * 60e3,
};

export function classifyToken(row: { type: string; expiresAt: Date; usedAt: Date | null } | null, expected: TokenType, now: Date): TokenProblem | null {
  if (!row || row.type !== expected) return "invalid";
  if (row.usedAt) return "used";
  if (row.expiresAt.getTime() <= now.getTime()) return "expired";
  return null;
}

/** Raw tokens are 32 random bytes in base64url (43 chars). Anything else is rejected before a DB lookup. */
export function looksLikeToken(raw: unknown): raw is string {
  return typeof raw === "string" && /^[A-Za-z0-9_-]{43}$/.test(raw);
}

export function requireEmailVerification() {
  return process.env.REQUIRE_EMAIL_VERIFICATION !== "false";
}

/**
 * E2E test mode (outbox email + /api/test/outbox). Honoured only when the app's own
 * URL is localhost, so it cannot be enabled on a real deployment by a stray variable.
 */
export function e2eTestMode() {
  return process.env.E2E_TEST_MODE === "1" && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(process.env.APP_URL ?? "");
}
