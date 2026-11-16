"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client/api";

/** POSTs to an API endpoint, toasts the outcome, and refreshes server data. */
export function ActionButton({ endpoint, body, label, success, variant = "secondary", size = "sm", confirmText, disabled }: {
  endpoint: string;
  body?: unknown;
  label: string;
  success: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  confirmText?: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [loading, setLoading] = useState(false);
  return (
    <Button
      variant={variant}
      size={size}
      loading={loading}
      disabled={disabled}
      onClick={async () => {
        if (confirmText && !window.confirm(confirmText)) return;
        setLoading(true);
        try {
          await api(endpoint, { method: "POST", body: body ?? {} });
          push({ tone: "success", title: success });
          router.refresh();
        } catch (e) {
          push({ tone: "error", title: `${label} failed`, body: e instanceof Error ? e.message : undefined });
        } finally {
          setLoading(false);
        }
      }}
    >
      {label}
    </Button>
  );
}
