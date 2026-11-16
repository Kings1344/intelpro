import { isIP } from "node:net";

/**
 * SSRF guard for user-submitted evidence URLs. Pure functions; the fetcher
 * additionally re-checks every DNS answer and redirect hop against these rules.
 */

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

const BLOCKED_HOSTNAMES = new Set(["localhost", "localhost.localdomain", "metadata.google.internal", "metadata"]);

export function checkPublicUrl(raw: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "Not a valid URL." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:")
    return { ok: false, reason: "Only http(s) URLs are accepted." };
  if (url.username || url.password) return { ok: false, reason: "URLs with embedded credentials are not accepted." };
  if (url.port && !["80", "443", "8080", "8443"].includes(url.port))
    return { ok: false, reason: "Non-standard ports are not accepted." };
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local"))
    return { ok: false, reason: "Internal hostnames are not accepted." };
  if (isIP(host) && isPrivateAddress(host)) return { ok: false, reason: "Private or reserved IP addresses are not accepted." };
  if (!isIP(host) && !host.includes(".")) return { ok: false, reason: "Hostname must be fully qualified." };
  return { ok: true, url };
}

/** True for loopback, private, link-local, CGNAT, multicast, reserved and mapped ranges. */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isPrivateV4(ip);
  if (v === 6) {
    const lower = ip.toLowerCase();
    const groups = expandV6(lower);
    if (!groups) return true;
    // IPv4-mapped (::ffff:a.b.c.d, incl. hex form ::ffff:7f00:1) and IPv4-compatible (::a.b.c.d).
    if (groups.slice(0, 5).every((g) => g === 0) && (groups[5] === 0xffff || groups[5] === 0)) {
      if (groups[5] === 0 && groups[6] === 0 && groups[7] <= 1) return true; // :: and ::1
      return isPrivateV4(`${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`);
    }
    const first = groups[0];
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
    if ((first & 0xff00) === 0xff00) return true; // multicast
    if (lower.startsWith("64:ff9b:")) return true; // NAT64
    if (lower.startsWith("2001:db8")) return true; // documentation
    return false;
  }
  return true;
}

/** Expands an IPv6 address (with optional embedded IPv4 tail) into eight 16-bit groups. */
function expandV6(ip: string): number[] | null {
  let s = ip.split("%")[0];
  const v4 = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const [a, b, c, d] = v4[1].split(".").map(Number);
    s = s.slice(0, -v4[1].length) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = s.split("::");
  const h = head ? head.split(":") : [];
  const t = tail !== undefined ? (tail ? tail.split(":") : []) : [];
  const missing = 8 - h.length - t.length;
  if (s.includes("::") ? missing < 0 : h.length !== 8) return null;
  const all = [...h, ...Array(s.includes("::") ? missing : 0).fill("0"), ...t].map((g) => parseInt(g || "0", 16));
  return all.length === 8 && all.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffff) ? all : null;
}

function isPrivateV4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast + reserved
  return false;
}
