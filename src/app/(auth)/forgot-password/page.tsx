"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { api } from "@/lib/client/api";

export default function ForgotPasswordPage() {
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  return (
    <>
      <h1 className="text-[19px] font-semibold tracking-[-0.01em]">Reset your password</h1>
      <p className="mt-1 mb-6 text-[13.5px] text-muted">Enter your account email. We&apos;ll send a link that works once, for 30 minutes.</p>
      {done ? (
        <Notice tone="emerald" className="mb-4">{done}</Notice>
      ) : (
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setLoading(true);
          try {
            const r = await api<{ message: string }>("/api/auth/forgot-password", { body: { email: new FormData(e.currentTarget).get("email") } });
            setDone(r.message);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Request failed.");
          } finally {
            setLoading(false);
          }
        }}>
          <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" required autoComplete="email" /></Field>
          {error && <Notice tone="rust">{error}</Notice>}
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>Send reset link</Button>
        </form>
      )}
      <p className="mt-4 text-center text-[13px] text-muted"><Link className="text-emerald hover:underline" href="/login">Back to sign in</Link></p>
    </>
  );
}
