import { db } from "@/lib/db";
import { route, parseJson, badRequest, conflict } from "@/lib/server/api";
import { registerSchema } from "@/lib/validation";
import { hashPassword, passwordProblems } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { limiters } from "@/lib/server/rate-limit";
import { audit } from "@/lib/server/audit";
import { sendVerification } from "@/lib/services/auth-email";

export const POST = route({ limiter: limiters.auth }, async ({ req, ip }) => {
  const body = await parseJson(req, registerSchema);
  const problems = passwordProblems(body.password);
  if (problems.length) throw badRequest(problems.join(" "));
  if (await db.user.findUnique({ where: { email: body.email } })) throw conflict("An account with this email already exists.");
  // New accounts start as MARKET_CREATOR so judges can exercise the full flow; reviewers/admins are promoted by an admin.
  const user = await db.user.create({
    data: { email: body.email, name: body.name, role: "MARKET_CREATOR", passwordHash: await hashPassword(body.password) },
    select: { id: true, email: true, name: true, role: true },
  });
  await audit(db, { actorId: user.id, action: "auth.register", entityType: "User", entityId: user.id, ip });
  await createSession(user.id);
  const verificationSent = await sendVerification(user, ip);
  return { ...user, emailVerified: false, verificationSent };
});
