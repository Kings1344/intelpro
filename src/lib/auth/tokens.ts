import "server-only";
import type { AuthTokenType } from "@prisma/client";
import { db } from "@/lib/db";
import { hashToken, newSessionToken } from "./password";
import { TOKEN_TTL_MS, classifyToken, type TokenProblem } from "./token-rules";

export class TokenError extends Error {
  constructor(public problem: TokenProblem) {
    super(
      problem === "expired"
        ? "This link has expired. Request a new one."
        : problem === "used"
          ? "This link has already been used. Request a new one if you still need it."
          : "This link is not valid. Check that you copied it completely, or request a new one.",
    );
  }
}

/** Issues a new single-use token; any earlier unused token of the same type is revoked. */
export async function issueToken(userId: string, type: AuthTokenType, ip: string | null) {
  const raw = newSessionToken();
  await db.$transaction([
    db.authToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: new Date() } }),
    db.authToken.create({ data: { userId, type, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + TOKEN_TTL_MS[type]), ip } }),
  ]);
  return raw;
}

/**
 * Atomically consumes a token. The `usedAt: null` condition in the update makes
 * concurrent double-submits safe: only one request can flip it.
 */
export async function consumeToken(raw: string, type: AuthTokenType): Promise<string> {
  const row = await db.authToken.findUnique({ where: { tokenHash: hashToken(raw) } });
  const problem = classifyToken(row, type, new Date());
  if (problem) throw new TokenError(problem);
  const flipped = await db.authToken.updateMany({ where: { id: row!.id, usedAt: null }, data: { usedAt: new Date() } });
  if (flipped.count !== 1) throw new TokenError("used");
  return row!.userId;
}
