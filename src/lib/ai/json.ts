/** Extracts the first top-level JSON object from model text output (handles code fences). Pure. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("Model response contained no JSON object.");
  return JSON.parse(candidate.slice(start, end + 1));
}
