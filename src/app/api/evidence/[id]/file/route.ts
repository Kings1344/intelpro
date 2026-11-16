import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { route, notFound } from "@/lib/server/api";

/** Downloads an uploaded PDF. Always served as an attachment so it never renders in the app's origin. */
export const GET = route<{ id: string }>({}, async ({ params }) => {
  const f = await db.evidenceFile.findUnique({ where: { evidenceId: params.id }, select: { fileName: true, data: true, sizeBytes: true, sha256: true } });
  if (!f) throw notFound("File");
  return new NextResponse(Buffer.from(f.data), {
    headers: {
      "content-type": "application/pdf",
      "content-length": String(f.sizeBytes),
      "content-disposition": `attachment; filename="${f.fileName.replace(/"/g, "")}"`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cache-control": "private, max-age=0, no-store",
      etag: `"${f.sha256}"`,
    },
  });
});
