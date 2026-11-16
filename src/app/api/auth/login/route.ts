import { db } from "@/lib/db";
import { route, parseJson, ApiError } from "@/lib/server/api";
import { loginSchema } from "@/lib/validation";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { limiters } from "@/lib/server/rate-limit";
import { audit } from "@/lib/server/audit";

const DUMMY_HASH = "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86) + "==";

export const POST = route({ limiter: limiters.auth }, async ({ req, ip }) => {
  const { email, password } = await parseJson(req, loginSchema);
  const user = await db.user.findUnique({ where: { email } });
  // Always run a hash comparison to keep timing similar for unknown emails.
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || user.isDemo) {
    await audit(db, { actorId: null, action: "auth.login_failed", entityType: "User", entityId: email, ip });
    throw new ApiError(401, "invalid_credentials", "Email or password is incorrect.");
  }
  await createSession(user.id);
  await audit(db, { actorId: user.id, action: "auth.login", entityType: "User", entityId: user.id, ip });
  return { id: user.id, email: user.email, name: user.name, role: user.role };
});
