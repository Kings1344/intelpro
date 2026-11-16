"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="max-w-xl rounded-[var(--radius-container)] border border-rust/30 bg-rust-wash p-6">
      <h1 className="text-[16px] font-semibold text-fg">This page could not load</h1>
      <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
        IntelPro hit an unexpected error while loading data. Check that the database is reachable (GET /api/health), then try again.
        {error.digest && <span className="mt-1 block font-mono text-[12px] text-faint">Reference {error.digest}</span>}
      </p>
      <Button className="mt-4" onClick={reset}>Try again</Button>
    </div>
  );
}
