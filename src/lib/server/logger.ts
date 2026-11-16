/** Minimal structured JSON logger (stdout). Never pass secrets in `meta`. */
type Level = "debug" | "info" | "warn" | "error";

function log(level: Level, event: string, meta: Record<string, unknown> = {}) {
  if (level === "debug" && process.env.NODE_ENV === "production") return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...meta });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (e: string, m?: Record<string, unknown>) => log("debug", e, m),
  info: (e: string, m?: Record<string, unknown>) => log("info", e, m),
  warn: (e: string, m?: Record<string, unknown>) => log("warn", e, m),
  error: (e: string, m?: Record<string, unknown>) => log("error", e, m),
};
