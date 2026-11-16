"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { api } from "@/lib/client/api";

export function VerifyEmail() {
  const token = useSearchParams().get("token");
  const [state, setState] = useState<{ status: "working" | "ok" | "error"; message?: string }>({ status: "working" });
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return; // StrictMode runs effects twice in development; a token is single-use.
    sent.current = true;
    if (!token) return setState({ status: "error", message: "This page needs the link from your confirmation email." });
    api("/api/auth/verify-email", { body: { token } })
      .then(() => setState({ status: "ok" }))
      .catch((e) => setState({ status: "error", message: e instanceof Error ? e.message : "Confirmation failed." }));
  }, [token]);

  if (state.status === "working")
    return <p className="flex items-center gap-2 text-[14px] text-muted"><Loader2 className="size-4 animate-spin" /> Confirming your email…</p>;
  if (state.status === "ok")
    return (
      <div className="space-y-4" data-testid="verify-ok">
        <h1 className="flex items-center gap-2 text-[19px] font-semibold"><CheckCircle2 className="size-5 text-emerald" /> Email confirmed</h1>
        <p className="text-[13.5px] text-muted">You can now create markets, submit evidence and take part in disputes.</p>
        <ButtonLink href="/overview" variant="primary" className="w-full">Go to IntelPro</ButtonLink>
      </div>
    );
  return (
    <div className="space-y-4" data-testid="verify-error">
      <h1 className="flex items-center gap-2 text-[19px] font-semibold"><AlertTriangle className="size-5 text-rust" /> Email not confirmed</h1>
      <p className="text-[13.5px] text-muted">{state.message}</p>
      <p className="text-[13px] text-faint">Signed in? Use “Resend email” in the banner at the top of IntelPro. Otherwise <Link className="text-emerald hover:underline" href="/login">sign in</Link> first.</p>
    </div>
  );
}
