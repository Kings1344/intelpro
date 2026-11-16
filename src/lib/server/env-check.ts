/** Pure production-configuration checks (unit tested). */
/** Problems that make a production deployment unsafe or broken; checked at boot (instrumentation.ts). */
export function productionProblems(e: Record<string, string | undefined> = process.env): string[] {
  const p: string[] = [];
  if (!e.DATABASE_URL) p.push("DATABASE_URL is not set.");
  if (!e.SESSION_SECRET || e.SESSION_SECRET.length < 32 || /replace-with|change-me/i.test(e.SESSION_SECRET)) p.push("SESSION_SECRET must be a random value of at least 32 characters.");
  const localE2E = e.E2E_TEST_MODE === "1" && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(e.APP_URL ?? "");
  if (!localE2E && (!e.APP_URL || !/^https:\/\//.test(e.APP_URL))) p.push("APP_URL must be the public https:// origin.");
  if (!localE2E && (!e.RESEND_API_KEY || !e.EMAIL_FROM))
    p.push("RESEND_API_KEY and EMAIL_FROM are required to send verification and password-reset emails.");
  if (e.SEED_ADMIN_PASSWORD === "change-me-now-123") p.push("SEED_ADMIN_PASSWORD is still the example value.");
  return p;
}

