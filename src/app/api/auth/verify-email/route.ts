import { z } from "zod";
import { db } from "@/lib/db";
import { route, parseJson, badRequest } from "@/lib/server/api";
import { consumeToken, TokenError } from "@/lib/auth/tokens";
import { looksLikeToken } from "@/lib/auth/token-rules";
import { limiters } from "@/lib/server/rate-limit";
import { audit } from "@/lib/server/audit";

const schema = z.object({ token: z.string().max(100) });

/** Confirms the email address behind a verification link. Works whether or not the user is signed in. */
export const POST = route({ limiter: limiters.auth }, async ({ req, ip }) => {
  const { token } = await parseJson(req, schema);
  if (!looksLikeToken(token)) throw badRequest(new TokenError("invalid").message);
  try {
    const userId = await consumeToken(token, "EMAIL_VERIFICATION");
    await db.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
    await audit(db, { actorId: userId, action: "auth.email_verified", entityType: "User", entityId: userId, ip });
    return { verified: true };
  } catch (e) {
    if (e instanceof TokenError) throw badRequest(e.message, { problem: e.problem });
    throw e;
  }
});
