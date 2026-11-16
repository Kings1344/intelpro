import { db } from "@/lib/db";
import { route, ApiError } from "@/lib/server/api";
import { limiters } from "@/lib/server/rate-limit";
import { sendVerification } from "@/lib/services/auth-email";

export const POST = route({ auth: true, limiter: limiters.email }, async ({ user, ip }) => {
  const u = await db.user.findUnique({ where: { id: user!.id }, select: { id: true, email: true, emailVerifiedAt: true } });
  if (u?.emailVerifiedAt) return { alreadyVerified: true, sent: false };
  const sent = await sendVerification(u!, ip);
  if (!sent) throw new ApiError(503, "email_unavailable", "The confirmation email could not be sent right now. Try again in a few minutes.");
  return { alreadyVerified: false, sent: true };
});
