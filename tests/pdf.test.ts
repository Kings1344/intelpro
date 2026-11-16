/** PDF evidence: validation + real pdfjs-dist extraction on committed fixtures. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { checkPdf, extractPdfText, safeFileName, MAX_PDF_BYTES } from "../src/lib/evidence/pdf";
import { quoteAppearsIn } from "../src/lib/evidence/text";

const fx = (f: string) => new Uint8Array(fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url)));

test("validation trusts magic bytes and limits, not the declared type alone", () => {
  assert.equal(checkPdf(fx("evidence-text.pdf"), "application/pdf", "report.pdf").ok, true);
  const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
  assert.deepEqual(checkPdf(html, "application/pdf", "fake.pdf"), { ok: false, reason: "The file is not a PDF (missing %PDF header)." });
  assert.equal(checkPdf(fx("evidence-text.pdf"), "text/html", "report.pdf").ok, false);
  assert.equal(checkPdf(fx("evidence-text.pdf"), "application/pdf", "report.exe").ok, false);
  assert.equal(checkPdf(new Uint8Array(0), "application/pdf", "a.pdf").ok, false);
  assert.equal(checkPdf(new Uint8Array(MAX_PDF_BYTES + 1), "application/pdf", "a.pdf").ok, false);
});

test("file names are sanitised", () => {
  assert.equal(safeFileName("../../etc/passwd.pdf"), "passwd.pdf");
  assert.equal(safeFileName('re"port<script>.pdf'), "re_port_script_.pdf");
  assert.equal(safeFileName("notes"), "notes.pdf");
});

test("text PDFs are extracted page by page, and claims can be grounded in the text", async () => {
  const r = await extractPdfText(fx("evidence-text.pdf"));
  assert.equal(r.status, "EXTRACTED");
  if (r.status !== "EXTRACTED") return;
  assert.equal(r.pageCount, 2);
  assert.equal(r.title, "Sample BTC report");
  assert.match(r.text, /\[Page 1\][\s\S]*\$118,420[\s\S]*\[Page 2\][\s\S]*\$150,000/);
  assert.ok(quoteAppearsIn("peaked at $118,420", r.text), "the grounding check works on extracted PDF text");
});

test("image-only PDFs are reported as unreadable, never summarised", async () => {
  const r = await extractPdfText(fx("evidence-image-only.pdf"));
  assert.equal(r.status, "NO_TEXT");
  if (r.status === "NO_TEXT") {
    assert.equal(r.chars, 0);
    assert.match(r.reason, /no text layer/i);
  }
});

test("damaged PDFs fail with a clear reason", async () => {
  const r = await extractPdfText(fx("evidence-broken.pdf"));
  assert.equal(r.status, "FAILED");
  if (r.status === "FAILED") assert.match(r.reason, /damaged|could not be read/);
});
