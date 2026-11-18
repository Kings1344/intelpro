/**
 * PDF evidence: validation and text extraction (pdfjs-dist, no network, no rendering).
 * A document is only treated as readable if it has a real text layer; scanned or
 * image-only PDFs are reported as such and never "summarised". OCR is not performed.
 */
import { createHash } from "node:crypto";

export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_PDF_PAGES = 300;
const MIN_CHARS_PER_PAGE = 25;

export type PdfCheck = { ok: true; sha256: string } | { ok: false; reason: string };

/** Validates by size and magic bytes; the browser-supplied MIME type alone is not trusted. */
export function checkPdf(bytes: Uint8Array, declaredType: string | null, fileName: string): PdfCheck {
  if (bytes.byteLength === 0) return { ok: false, reason: "The file is empty." };
  if (bytes.byteLength > MAX_PDF_BYTES) return { ok: false, reason: `The file is larger than ${MAX_PDF_BYTES / 1024 / 1024} MB.` };
  if (declaredType && !/^application\/(pdf|x-pdf|octet-stream)$/i.test(declaredType)) return { ok: false, reason: `Only PDF files are accepted (received ${declaredType}).` };
  if (!/\.pdf$/i.test(fileName)) return { ok: false, reason: "The file name must end in .pdf." };
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  if (!head.includes("%PDF-")) return { ok: false, reason: "The file is not a PDF (missing %PDF header)." };
  return { ok: true, sha256: createHash("sha256").update(bytes).digest("hex") };
}

export function safeFileName(name: string) {
  const base = name.split(/[\\/]/).pop() ?? "document.pdf";
  const cleaned = base.replace(/[^\w.\- ()]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 120);
  return /\.pdf$/i.test(cleaned) ? cleaned : `${cleaned || "document"}.pdf`;
}

export type PdfExtraction =
  | { status: "EXTRACTED"; pageCount: number; text: string; chars: number; title: string | null }
  | { status: "NO_TEXT"; pageCount: number; chars: number; reason: string }
  | { status: "FAILED"; pageCount: number | null; reason: string };

export async function extractPdfText(bytes: Uint8Array): Promise<PdfExtraction> {
  let pdfjs: typeof import("pdfjs-dist/legacy/build/pdf.mjs");
  try {
    pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  } catch (e) {
    return { status: "FAILED", pageCount: null, reason: `PDF reader unavailable: ${e instanceof Error ? e.message : e}` };
  }
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes), // pdfjs transfers the buffer; pass a copy
    disableFontFace: true,
    useSystemFonts: false,
    stopAtErrors: false,
    verbosity: 0, // text extraction only: font-rendering warnings are irrelevant
  });
  try {
    const doc = await task.promise;
    const pageCount = doc.numPages;
    if (pageCount > MAX_PDF_PAGES) return { status: "FAILED", pageCount, reason: `The PDF has ${pageCount} pages; the limit is ${MAX_PDF_PAGES}.` };
    const pages: string[] = [];
    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const line = content.items
        .map((it) => ("str" in it ? `${it.str}${(it as { hasEOL?: boolean }).hasEOL ? "\n" : ""}` : ""))
        .join("")
        .replace(/[ \t]+/g, " ")
        .trim();
      pages.push(line);
      page.cleanup();
    }
    const text = pages.map((p, i) => `[Page ${i + 1}]\n${p}`).join("\n\n");
    const chars = pages.reduce((a, p) => a + p.replace(/\s/g, "").length, 0);
    if (chars < MIN_CHARS_PER_PAGE * Math.min(pageCount, 3))
      return {
        status: "NO_TEXT",
        pageCount,
        chars,
        reason: chars === 0
          ? "The PDF has no text layer. It is probably a scan or an image, and Lockline does not run OCR, so its contents were not read."
          : `Only ${chars} characters of text were found across ${pageCount} page(s). The PDF is probably scanned, so its contents could not be read reliably.`,
      };
    const meta = await doc.getMetadata().catch(() => null);
    const title = (meta?.info as { Title?: string } | undefined)?.Title?.trim() || null;
    return { status: "EXTRACTED", pageCount, text: text.slice(0, 400_000), chars, title };
  } catch (e) {
    const name = (e as { name?: string })?.name ?? "";
    const reason = name === "PasswordException"
      ? "The PDF is password-protected, so it could not be read."
      : name === "InvalidPDFException"
        ? "The file is damaged or not a valid PDF."
        : `The PDF could not be read: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`;
    return { status: "FAILED", pageCount: null, reason };
  } finally {
    await task.destroy().catch(() => {});
  }
}
