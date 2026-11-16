/** Pure text utilities for evidence processing. */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|br|section|article)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#?\w+);/g, (m, e: string) => {
      if (ENTITIES[e]) return ENTITIES[e];
      if (e.startsWith("#x")) return String.fromCodePoint(parseInt(e.slice(2), 16));
      if (e.startsWith("#")) return String.fromCodePoint(parseInt(e.slice(1), 10));
      return m;
    })
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

export function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? htmlToText(m[1]).slice(0, 300) : null;
}

const STOP = new Set(
  "the a an of to in on at by for and or is be will before after with from that this as are was were than any its it into per under over between whether which who what when".split(" "),
);

export function keywords(text: string, max = 25): string[] {
  const counts = new Map<string, number>();
  for (const raw of text.toLowerCase().match(/[a-z0-9$][a-z0-9$.,/%-]*/g) ?? []) {
    const w = raw.replace(/[.,]+$/, "");
    if (w.length < 3 || STOP.has(w)) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([w]) => w);
}

/** Select the sentences most related to the criteria keywords (bounded size, for LLM context). */
export function relevantExcerpt(text: string, terms: string[], maxChars = 6000): { excerpt: string; hits: number } {
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 20);
  const lowered = terms.map((t) => t.toLowerCase());
  const scored = sentences.map((s, i) => {
    const l = s.toLowerCase();
    const score = lowered.reduce((acc, t) => acc + (l.includes(t) ? 1 : 0), 0);
    return { s, i, score };
  });
  const picked = scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  const hits = picked.length;
  const chosen: typeof picked = [];
  let size = 0;
  for (const p of picked) {
    if (size + p.s.length > maxChars) break;
    chosen.push(p);
    size += p.s.length + 1;
  }
  chosen.sort((a, b) => a.i - b.i);
  return { excerpt: chosen.map((c) => c.s).join("\n"), hits };
}

export function normalizeForMatch(s: string) {
  return s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
}

/** True only if `quote` literally appears in `source` (whitespace/quote-style insensitive). */
export function quoteAppearsIn(quote: string, source: string): boolean {
  const q = normalizeForMatch(quote);
  if (q.length < 8) return false;
  return normalizeForMatch(source).includes(q);
}
