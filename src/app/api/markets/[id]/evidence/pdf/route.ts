import { db } from "@/lib/db";
import { route, notFound, badRequest, ApiError } from "@/lib/server/api";
import { pdfEvidenceInput } from "@/lib/validation";
import { checkPdf, extractPdfText, MAX_PDF_BYTES, safeFileName } from "@/lib/evidence/pdf";
import { checkPublicUrl } from "@/lib/evidence/safe-url";
import { limiters } from "@/lib/server/rate-limit";
import { activity, audit, notify } from "@/lib/server/audit";

export const runtime = "nodejs";

/**
 * Upload PDF evidence (multipart/form-data: `file` + evidence fields).
 * The text layer is extracted immediately. Status becomes ACCESSIBLE when text was read,
 * or UNABLE_TO_VERIFY with the exact reason (scanned, encrypted, damaged). Analysis then
 * runs through the normal evidence pipeline.
 */
export const POST = route<{ id: string }>({ permission: "evidence:submit", limiter: limiters.upload }, async ({ req, params, user, ip }) => {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_PDF_BYTES + 64 * 1024) throw new ApiError(413, "too_large", "The file is larger than 10 MB.");
  const market = await db.market.findUnique({ where: { id: params.id }, select: { id: true, creatorId: true, question: true, status: true } });
  if (!market) throw notFound("Market");
  if (["RESOLVED", "CANCELLED"].includes(market.status)) throw badRequest("This market is closed to new evidence.");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw badRequest("Send the PDF as multipart/form-data.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("Attach a PDF file in the `file` field.");
  const fields = pdfEvidenceInput.parse(Object.fromEntries([...form.entries()].filter(([k, v]) => k !== "file" && typeof v === "string" && v !== "")));
  if (fields.sourceUrl) {
    const c = checkPublicUrl(fields.sourceUrl);
    if (!c.ok) throw badRequest(`Original URL rejected: ${c.reason}`);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const fileName = safeFileName(file.name);
  const check = checkPdf(bytes, file.type || null, fileName);
  if (!check.ok) throw new ApiError(415, "invalid_pdf", check.reason);

  const extraction = await extractPdfText(bytes);
  const readable = extraction.status === "EXTRACTED";
  const reason = extraction.status === "EXTRACTED" ? null : extraction.reason;

  const ev = await db.$transaction(async (tx) => {
    const e = await tx.evidence.create({
      data: {
        marketId: market.id,
        submittedById: user!.id,
        title: fields.title,
        sourceName: fields.sourceName,
        sourceKind: "PDF_UPLOAD",
        sourceUrl: fields.sourceUrl ?? null,
        description: fields.description,
        publishedAt: fields.publishedAt ? new Date(fields.publishedAt) : null,
        category: fields.category,
        claimedStance: fields.claimedStance,
        status: readable ? "ACCESSIBLE" : "UNABLE_TO_VERIFY",
        contentHash: check.sha256,
        fetchedAt: new Date(),
        fetchError: reason,
      },
    });
    await tx.evidenceFile.create({
      data: {
        evidenceId: e.id,
        fileName,
        mimeType: "application/pdf",
        sizeBytes: bytes.byteLength,
        sha256: check.sha256,
        pageCount: extraction.pageCount,
        data: Buffer.from(bytes),
        extractionStatus: extraction.status,
        extractionError: reason,
        extractedText: readable ? extraction.text : null,
        extractedChars: extraction.status === "FAILED" ? 0 : extraction.chars,
      },
    });
    await activity(tx, { marketId: market.id, actorId: user!.id, type: "evidence.submitted", message: `PDF evidence uploaded: ${fields.title}${readable ? "" : " (text could not be read)"}` });
    await audit(tx, { actorId: user!.id, action: "evidence.upload_pdf", entityType: "Evidence", entityId: e.id, metadata: { sha256: check.sha256, bytes: bytes.byteLength, extraction: extraction.status }, ip });
    if (market.creatorId && market.creatorId !== user!.id)
      await notify(tx, { userId: market.creatorId, type: "evidence.submitted", title: "New PDF evidence submitted", body: market.question, link: `/evidence/${market.id}` });
    return e;
  });

  return {
    id: ev.id,
    status: ev.status,
    extraction: { status: extraction.status, pageCount: extraction.pageCount, chars: extraction.status === "FAILED" ? 0 : extraction.chars, reason },
  };
});
