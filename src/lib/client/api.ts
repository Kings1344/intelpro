"use client";

export class ClientApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/** Typed fetch wrapper for Lockline's `{ data } | { error }` envelope. */
export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: opts.body ? { "content-type": "application/json" } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
  });
  let json: { data?: T; error?: { message: string; code: string; details?: unknown } } = {};
  try {
    json = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok || json.error) {
    const e = json.error;
    const detail = Array.isArray(e?.details) && e.code === "validation_error" ? ` (${(e.details as { path: string; message: string }[]).map((d) => `${d.path}: ${d.message}`).join("; ")})` : "";
    throw new ClientApiError((e?.message ?? `Request failed (HTTP ${res.status}).`) + detail, res.status, e?.code ?? "error", e?.details);
  }
  return json.data as T;
}
