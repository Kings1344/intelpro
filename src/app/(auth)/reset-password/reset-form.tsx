"use client";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { api } from "@/lib/client/api";

export function ResetForm() {
  const token = useSearchParams().get("token");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!token) return <Notice tone="rust">This page needs the link from your reset email. <Link className="underline" href="/forgot-password">Request a new link</Link>.</Notice>;
  if (done)
    return (
      <div className="space-y-4" data-testid="reset-ok">
        <Notice tone="emerald">Password changed. Sign in with your new password.</Notice>
        <ButtonLink href="/login" variant="primary" className="w-full">Sign in</ButtonLink>
      </div>
    );
  return (
    <form className="space-y-4" onSubmit={async (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const password = String(f.get("password"));
      if (password !== String(f.get("confirm"))) return setError("The two passwords do not match.");
      setError(null);
      setLoading(true);
      try {
        await api("/api/auth/reset-password", { body: { token, password } });
        setDone(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Reset failed.");
      } finally {
        setLoading(false);
      }
    }}>
      <Field label="New password" htmlFor="password" hint="At least 10 characters, with letters and numbers."><Input id="password" name="password" type="password" minLength={10} required autoComplete="new-password" /></Field>
      <Field label="Repeat new password" htmlFor="confirm"><Input id="confirm" name="confirm" type="password" minLength={10} required autoComplete="new-password" /></Field>
      {error && <Notice tone="rust">{error} {/expired|used|not valid/.test(error) && <Link className="underline" href="/forgot-password">Request a new link</Link>}</Notice>}
      <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>Save new password</Button>
    </form>
  );
}
