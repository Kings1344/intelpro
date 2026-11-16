import "server-only";
import { db } from "@/lib/db";
import { issueToken } from "@/lib/auth/tokens";
import { resetEmail, sendEmail, verificationEmail } from "@/lib/server/email";
import { logger } from "@/lib/server/logger";

function appUrl() {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Returns whether the email was handed to the transport; never throws to the caller. */
export async function sendVerification(user: { id: string; email: string }, ip: string | null): Promise<boolean> {
  try {
    const token = await issueToken(user.id, "EMAIL_VERIFICATION", ip);
    await sendEmail(verificationEmail(user.email, `${appUrl()}/verify-email?token=${token}`));
    return true;
  } catch (e) {
    logger.warn("auth.verification_email_failed", { userId: user.id, err: e instanceof Error ? e.message : String(e) });
    return false;
  }
}

export async function sendPasswordReset(email: string, ip: string | null): Promise<void> {
  const user = await db.user.findUnique({ where: { email }, select: { id: true, email: true, isDemo: true } });
  if (!user || user.isDemo) return; // identical response either way: no account enumeration
  try {
    const token = await issueToken(user.id, "PASSWORD_RESET", ip);
    await sendEmail(resetEmail(user.email, `${appUrl()}/reset-password?token=${token}`));
  } catch (e) {
    logger.warn("auth.reset_email_failed", { userId: user.id, err: e instanceof Error ? e.message : String(e) });
  }
}
