import "server-only";
import { lookup } from "node:dns";
import { createHash } from "node:crypto";
import { Agent, fetch as undiciFetch } from "undici";
import { checkPublicUrl, isPrivateAddress } from "./safe-url";
import { extractTitle, htmlToText } from "./text";

export type FetchResult =
  | { ok: true; finalUrl: string; httpStatus: number; contentType: string; title: string | null; text: string; contentHash: string }
  | { ok: false; reason: string; httpStatus?: number };

const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

/**
 * DNS lookup that refuses private/reserved answers. Because the check happens
 * inside the socket connect path, it also defeats DNS-rebinding between check and use.
 */
const safeAgent = new Agent({
  connect: {
    lookup(hostname, options, cb) {
      lookup(hostname, { ...options, all: true }, (err, addresses) => {
        if (err) return cb(err, "", 4);
        const list = Array.isArray(addresses) ? addresses : [{ address: addresses as unknown as string, family: 4 }];
        const bad = list.find((a) => isPrivateAddress(a.address));
        if (bad) return cb(new Error(`Blocked private address for ${hostname}`), "", 4);
        // undici expects the "all" form when options.all is set.
        if ((options as { all?: boolean }).all) return (cb as unknown as (e: null, a: typeof list) => void)(null, list);
        cb(null, list[0].address, list[0].family);
      });
    },
  },
  headersTimeout: TIMEOUT_MS,
  bodyTimeout: TIMEOUT_MS,
});

export async function fetchEvidenceSource(rawUrl: string): Promise<FetchResult> {
  let current = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const check = checkPublicUrl(current);
    if (!check.ok) return { ok: false, reason: check.reason };
    let res;
    try {
      res = await undiciFetch(check.url, {
        dispatcher: safeAgent,
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          "user-agent": "IntelProEvidenceBot/1.0 (+evidence verification; respects robots by design)",
          accept: "text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.1",
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, reason: /abort|timeout/i.test(msg) ? "Timed out retrieving the source." : `Could not connect: ${msg.slice(0, 160)}` };
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location")!, check.url).toString();
      continue;
    }
    if (res.status >= 400) return { ok: false, reason: `Source responded with HTTP ${res.status}.`, httpStatus: res.status };

    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!/text\/html|text\/plain|application\/json|application\/xhtml|text\/xml|application\/xml/.test(contentType)) {
      return { ok: false, reason: `Unsupported content type "${contentType || "unknown"}" (PDF and binary files are not analysed).`, httpStatus: res.status };
    }
    const body = await readCapped(res.body as ReadableStream<Uint8Array> | null);
    if (body === null) return { ok: false, reason: "Source exceeded the 2 MB retrieval limit.", httpStatus: res.status };
    const raw = new TextDecoder("utf-8", { fatal: false }).decode(body);
    const isHtml = contentType.includes("html") || contentType.includes("xml");
    const text = isHtml ? htmlToText(raw) : raw;
    if (text.trim().length < 40) return { ok: false, reason: "Source returned no readable text (it may require JavaScript or a login).", httpStatus: res.status };
    return {
      ok: true,
      finalUrl: check.url.toString(),
      httpStatus: res.status,
      contentType,
      title: isHtml ? extractTitle(raw) : null,
      text: text.slice(0, 200_000),
      contentHash: createHash("sha256").update(body).digest("hex"),
    };
  }
  return { ok: false, reason: "Too many redirects." };
}

async function readCapped(stream: ReadableStream<Uint8Array> | null): Promise<Uint8Array | null> {
  if (!stream) return new Uint8Array();
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}
