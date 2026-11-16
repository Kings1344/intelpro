/** Runs once when the server boots. Fails fast on unsafe production configuration. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  const { productionProblems } = await import("./lib/server/env-check");
  const problems = productionProblems();
  if (problems.length === 0) return;
  const msg = `IntelPro refused to start: unsafe production configuration:\n- ${problems.join("\n- ")}`;
  if (process.env.ALLOW_UNSAFE_CONFIG === "1") console.error(`${msg}\n(continuing because ALLOW_UNSAFE_CONFIG=1)`);
  else throw new Error(msg);
}
