import { z } from "zod";
import { db } from "@/lib/db";
import { route, parseJson, badRequest } from "@/lib/server/api";
import { consumeToken, TokenError } from "@/lib/auth/tokens";
import { looksLikeToken } from "@/lib/auth/token-rules";
import { hashPassword, passwordProblems } from "@/lib/auth/password";
import { destroyAllSessions } from "@/lib/auth/session";
import { limiters } from "@/lib/server/rate-limit";
import { audit } from "@/lib/server/audit";

const schema = z.object({ token: z.string().max(100), password: z.string().min(1).max(200) });

/** Sets a new password, signs out every session, and marks the email verified (the link proved ownership). */
export const POST = route({ limiter: limiters.auth }, async ({ req, ip }) => {
  const { token, password } = await parseJson(req, schema);
  const problems = passwordProblems(password);
  if (problems.length) throw badRequest(problems.join(" "));
  if (!looksLikeToken(token)) throw badRequest(new TokenError("invalid").message);
  let userId: string;
  try {
    userId = await consumeToken(token, "PASSWORD_RESET");
  } catch (e) {
    if (e instanceof TokenError) throw badRequest(e.message, { problem: e.problem });
    throw e;
  }
  const passwordHash = await hashPassword(password);
  const existing = await db.user.findUnique({ where: { id: userId }, select: { emailVerifiedAt: true } });
  await db.user.update({ where: { id: userId }, data: { passwordHash, emailVerifiedAt: existing?.emailVerifiedAt ?? new Date() } });
  await destroyAllSessions(userId);
  await audit(db, { actorId: userId, action: "auth.password_reset", entityType: "User", entityId: userId, ip });
  return { reset: true };
});
