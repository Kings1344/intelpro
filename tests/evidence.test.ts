import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveStatuses, type EvidenceForStatus } from "../src/lib/evidence/status";
import { checkPublicUrl, isPrivateAddress } from "../src/lib/evidence/safe-url";
import { htmlToText, quoteAppearsIn, relevantExcerpt, extractTitle } from "../src/lib/evidence/text";

const ev = (id: string, url: string, stance: EvidenceForStatus["analysedStance"], status: EvidenceForStatus["status"] = "ANALYSED"): EvidenceForStatus => ({ id, sourceUrl: url, status, analysedStance: stance });

test("independent agreement corroborates; same-domain agreement does not", () => {
  const r = deriveStatuses([ev("a", "https://a.example.com/x", "SUPPORTS_NO"), ev("b", "https://data.example.net/y", "SUPPORTS_NO")]);
  assert.deepEqual(r.sort((x, y) => x.id.localeCompare(y.id)), [{ id: "a", status: "CORROBORATED" }, { id: "b", status: "CORROBORATED" }]);
  assert.deepEqual(deriveStatuses([ev("a", "https://a.example.com/x", "SUPPORTS_NO"), ev("b", "https://b.example.com/y", "SUPPORTS_NO")]), []);
});

test("opposing analysed stances contradict each other", () => {
  const r = deriveStatuses([ev("a", "https://a.example.com", "SUPPORTS_YES"), ev("b", "https://b.example.org", "SUPPORTS_NO"), ev("c", "https://c.example.net", "NEUTRAL")]);
  assert.deepEqual(r.map((x) => `${x.id}:${x.status}`).sort(), ["a:CONTRADICTED", "b:CONTRADICTED"]);
});

test("unverified and unanalysed records never become corroborated", () => {
  const r = deriveStatuses([ev("a", "https://a.example.com", "SUPPORTS_YES"), ev("b", "https://b.example.org", "SUPPORTS_YES", "UNABLE_TO_VERIFY"), ev("c", "https://c.example.net", null, "SUBMITTED")]);
  assert.deepEqual(r, []);
});

test("statuses revert when the conflict disappears", () => {
  assert.deepEqual(deriveStatuses([ev("a", "https://a.example.com", "SUPPORTS_YES", "CONTRADICTED")]), [{ id: "a", status: "ANALYSED" }]);
});

test("SSRF guard blocks private, internal and credentialed URLs", () => {
  for (const bad of ["http://localhost/x", "http://127.0.0.1", "http://10.0.0.5", "http://169.254.169.254/latest/meta-data", "http://[::1]/", "http://[::ffff:127.0.0.1]/", "http://192.168.1.1", "http://172.20.0.1", "http://100.64.0.1", "ftp://example.com/file", "https://user:pw@example.com", "http://metadata.google.internal", "https://example.com:6379", "http://intranet/"])
    assert.equal(checkPublicUrl(bad).ok, false, bad);
  for (const good of ["https://www.coingecko.com/en/coins/bitcoin", "http://example.com/a?b=c", "https://8.8.8.8/"]) assert.equal(checkPublicUrl(good).ok, true, good);
  assert.equal(isPrivateAddress("fd00::1"), true);
  assert.equal(isPrivateAddress("::ffff:7f00:1"), true, "hex IPv4-mapped loopback");
  assert.equal(isPrivateAddress("::ffff:a9fe:a9fe"), true, "hex IPv4-mapped metadata address");
  assert.equal(isPrivateAddress("::ffff:808:808"), false, "mapped public address");
  assert.equal(isPrivateAddress("0:0:0:0:0:0:0:1"), true);
  assert.equal(isPrivateAddress("2606:4700::1111"), false);
});

test("html to text strips scripts and decodes entities", () => {
  const html = "<html><head><title>BTC &amp; markets</title><script>alert(1)</script></head><body><p>Price &gt; $100k</p><p>Second&nbsp;para</p></body></html>";
  const t = htmlToText(html);
  assert.ok(!t.includes("alert"));
  assert.match(t, /Price > \$100k/);
  assert.equal(extractTitle(html), "BTC & markets");
});

test("claim quotes must literally appear in the source text", () => {
  const src = "The aggregated series peaks at $118,420 during the window.\nNothing else.";
  assert.equal(quoteAppearsIn("peaks at  $118,420", src), true);
  assert.equal(quoteAppearsIn("peaks at $150,000", src), false);
  assert.equal(quoteAppearsIn("short", src), false, "too short to be meaningful");
});

test("relevant excerpt keeps matching sentences in original order", () => {
  const text = "Unrelated intro sentence here. Bitcoin price hit a new high today. Weather was nice all week long. The BTC/USD index closed lower.";
  const { excerpt, hits } = relevantExcerpt(text, ["bitcoin", "btc/usd"]);
  assert.equal(hits, 2);
  assert.ok(excerpt.indexOf("Bitcoin") < excerpt.indexOf("BTC/USD"));
  assert.ok(!excerpt.includes("Weather"));
});
