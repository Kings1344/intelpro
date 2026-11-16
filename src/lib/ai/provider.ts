import "server-only";
import type { ZodSchema } from "zod";
import { aiConfigured } from "@/lib/server/env";
import { logger } from "@/lib/server/logger";
import { extractJson } from "./json";

export { extractJson };

export class AiUnavailableError extends Error {}

const ENDPOINT = "https://api.anthropic.com/v1/messages";

export function aiModel() {
  return process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
}

/**
 * Calls the LLM and returns schema-validated structured output.
 * One corrective retry is made if the first response fails validation.
 */
export async function generateStructured<T>(opts: {
  system: string;
  prompt: string;
  schema: ZodSchema<T>;
  maxTokens?: number;
  task: string;
}): Promise<{ data: T; model: string }> {
  if (!aiConfigured()) throw new AiUnavailableError("No AI provider is configured (ANTHROPIC_API_KEY is empty).");
  const model = aiModel();
  const messages: { role: "user" | "assistant"; content: string }[] = [{ role: "user", content: opts.prompt }];

  for (let attempt = 0; attempt < 2; attempt++) {
    const started = Date.now();
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model, max_tokens: opts.maxTokens ?? 2500, temperature: 0, system: opts.system, messages }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.warn("ai.http_error", { task: opts.task, status: res.status, body: body.slice(0, 300) });
      throw new AiUnavailableError(`AI provider returned HTTP ${res.status}.`);
    }
    const json = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (json.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
    logger.info("ai.call", { task: opts.task, model, attempt, ms: Date.now() - started });
    try {
      const parsed = opts.schema.safeParse(extractJson(text));
      if (parsed.success) return { data: parsed.data, model };
      messages.push({ role: "assistant", content: text });
      messages.push({
        role: "user",
        content: `Your JSON did not match the required schema: ${parsed.error.issues
          .slice(0, 8)
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")}. Reply again with only the corrected JSON object.`,
      });
    } catch (e) {
      messages.push({ role: "assistant", content: text });
      messages.push({ role: "user", content: `That was not valid JSON (${String(e)}). Reply with only the JSON object.` });
    }
  }
  throw new AiUnavailableError("AI output failed schema validation twice.");
}
