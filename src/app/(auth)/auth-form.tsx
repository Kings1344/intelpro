"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { api } from "@/lib/client/api";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const f = new FormData(e.currentTarget);
    try {
      await api(`/api/auth/${mode}`, {
        body: mode === "register" ? { name: f.get("name"), email: f.get("email"), password: f.get("password") } : { email: f.get("email"), password: f.get("password") },
      });
      router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : "/markets");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {mode === "register" && (
        <Field label="Name" htmlFor="name">
          <Input id="name" name="name" required minLength={2} autoComplete="name" />
        </Field>
      )}
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </Field>
      <Field label="Password" htmlFor="password" hint={mode === "register" ? "At least 10 characters, with letters and numbers." : <Link href="/forgot-password" className="text-emerald hover:underline">Forgot your password?</Link>}>
        <Input id="password" name="password" type="password" required minLength={mode === "register" ? 10 : 1} autoComplete={mode === "register" ? "new-password" : "current-password"} />
      </Field>
      {error && <Notice tone="rust">{error}</Notice>}
      <Button type="submit" variant="primary" className="w-full" size="lg" loading={loading}>
        {mode === "register" ? "Create account" : "Sign in"}
      </Button>
      <p className="text-center text-[13px] text-muted">
        {mode === "register" ? (
          <>Already have an account? <Link className="text-emerald hover:underline" href="/login">Sign in</Link></>
        ) : (
          <>New to Lockline? <Link className="text-emerald hover:underline" href="/register">Create an account</Link></>
        )}
      </p>
    </form>
  );
}
