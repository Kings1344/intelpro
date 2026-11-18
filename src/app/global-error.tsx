"use client";

/** Last-resort error boundary (errors in the root layout). Shows no internals. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", background: "#0e1012", color: "#e9ecee", fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center" }}>
        <div style={{ maxWidth: 440, padding: 24 }}>
          <h1 style={{ fontSize: 18, margin: "0 0 8px" }}>Lockline is unavailable</h1>
          <p style={{ fontSize: 14, color: "#98a0a8", lineHeight: 1.6 }}>An unexpected error stopped the page from loading. Try again; if it keeps happening, check /api/health.</p>
          {error.digest && <p style={{ fontSize: 12, color: "#687079", fontFamily: "monospace" }}>Reference {error.digest}</p>}
          <button onClick={reset} style={{ marginTop: 12, background: "#2fb383", color: "#06130d", border: 0, borderRadius: 6, padding: "8px 14px", fontWeight: 600, cursor: "pointer" }}>Try again</button>
        </div>
      </body>
    </html>
  );
}
