import "server-only";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { logger } from "./logger";
import { e2eTestMode } from "@/lib/auth/token-rules";

/**
 * Outbound email. Transports (EMAIL_TRANSPORT):
 * - "resend": production transport via the Resend HTTP API (RESEND_API_KEY, EMAIL_FROM).
 * - "outbox": writes messages to a JSON file for local development and E2E tests. Never in production.
 * - "log":    prints the message (including links) to the server console. Development only.
 * Production refuses "outbox"/"log" (outbox is allowed only in E2E test mode on localhost),
 * so tokens never end up in production logs.
 */
export type Email = { to: string; subject: string; text: string; html: string; kind: string };

export class EmailNotConfiguredError extends Error {}

export function emailTransport(): "resend" | "outbox" | "log" {
  const t = (process.env.EMAIL_TRANSPORT ?? (process.env.RESEND_API_KEY ? "resend" : process.env.NODE_ENV === "production" ? "resend" : "log")) as "resend" | "outbox" | "log";
  return t;
}

export function outboxPath() {
  return process.env.EMAIL_OUTBOX_PATH || path.join(os.tmpdir(), "intelpro-outbox.json");
}

export async function sendEmail(email: Email): Promise<void> {
  const transport = emailTransport();
  if (process.env.NODE_ENV === "production" && transport !== "resend" && !(transport === "outbox" && e2eTestMode()))
    throw new EmailNotConfiguredError("Email is not configured for production (set RESEND_API_KEY and EMAIL_FROM).");

  if (transport === "resend") {
    const key = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!key || !from) throw new EmailNotConfiguredError("Email is not configured (RESEND_API_KEY and EMAIL_FROM are required).");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      logger.warn("email.send_failed", { kind: email.kind, status: res.status });
      throw new Error(`Email provider responded with HTTP ${res.status}.`);
    }
    logger.info("email.sent", { kind: email.kind });
    return;
  }

  if (transport === "outbox") {
    const file = outboxPath();
    let list: (Email & { at: string })[] = [];
    try {
      list = JSON.parse(await fs.readFile(file, "utf8"));
    } catch {
      list = [];
    }
    list.push({ ...email, at: new Date().toISOString() });
    await fs.writeFile(file, JSON.stringify(list.slice(-200), null, 1));
    return;
  }

  // Development only: surface the message so a developer can follow the link.
  console.log(`\n[Lockline dev email] To: ${email.to}\nSubject: ${email.subject}\n${email.text}\n`);
}

const shell = (title: string, body: string, cta: { href: string; label: string }) => `<!doctype html><html><body style="margin:0;background:#0e1012;font-family:-apple-system,Segoe UI,sans-serif;color:#e9ecee">
<div style="max-width:520px;margin:0 auto;padding:32px 24px">
<p style="font-size:15px;font-weight:600;margin:0 0 24px">Lockline</p>
<h1 style="font-size:19px;margin:0 0 12px">${title}</h1>
<p style="font-size:14px;line-height:1.6;color:#98a0a8;margin:0 0 24px">${body}</p>
<a href="${cta.href}" style="display:inline-block;background:#2fb383;color:#06130d;text-decoration:none;font-weight:600;font-size:14px;padding:10px 16px;border-radius:6px">${cta.label}</a>
<p style="font-size:12px;line-height:1.6;color:#687079;margin:24px 0 0">If the button does not work, open this link:<br><span style="word-break:break-all">${cta.href}</span></p>
<p style="font-size:12px;color:#687079;margin:24px 0 0">If you did not request this, you can ignore this email.</p>
</div></body></html>`;

export function verificationEmail(to: string, link: string): Email {
  return {
    kind: "verify_email",
    to,
    subject: "Confirm your Lockline email address",
    text: `Confirm your email address to start creating markets, submitting evidence and taking part in disputes.\n\n${link}\n\nThis link expires in 24 hours and can be used once.`,
    html: shell("Confirm your email address", "Confirm your email address to start creating markets, submitting evidence and taking part in disputes. This link expires in 24 hours and can be used once.", { href: link, label: "Confirm email" }),
  };
}

export function resetEmail(to: string, link: string): Email {
  return {
    kind: "password_reset",
    to,
    subject: "Reset your Lockline password",
    text: `Use this link to choose a new password. It expires in 30 minutes and can be used once. All your existing sessions will be signed out.\n\n${link}`,
    html: shell("Reset your password", "Use this link to choose a new password. It expires in 30 minutes and can be used once. All your existing sessions will be signed out.", { href: link, label: "Choose a new password" }),
  };
}
