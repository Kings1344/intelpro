-- Email verification, password reset and PDF evidence.

-- CreateEnum
CREATE TYPE "AuthTokenType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');
CREATE TYPE "EvidenceSourceKind" AS ENUM ('URL', 'PDF_UPLOAD');
CREATE TYPE "ExtractionStatus" AS ENUM ('EXTRACTED', 'NO_TEXT', 'FAILED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
ALTER TABLE "Evidence" ADD COLUMN "sourceKind" "EvidenceSourceKind" NOT NULL DEFAULT 'URL',
ALTER COLUMN "sourceUrl" DROP NOT NULL;

-- Existing accounts predate verification; the seeded admin and demo personas are treated as verified.
UPDATE "User" SET "emailVerifiedAt" = "createdAt" WHERE "role" = 'ADMIN' OR "isDemo" = true;

-- CreateTable
CREATE TABLE "AuthToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "AuthTokenType" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EvidenceFile" (
    "id" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "pageCount" INTEGER,
    "data" BYTEA NOT NULL,
    "extractionStatus" "ExtractionStatus" NOT NULL,
    "extractionError" TEXT,
    "extractedText" TEXT,
    "extractedChars" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvidenceFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthToken_tokenHash_key" ON "AuthToken"("tokenHash");
CREATE INDEX "AuthToken_userId_type_idx" ON "AuthToken"("userId", "type");
CREATE UNIQUE INDEX "EvidenceFile_evidenceId_key" ON "EvidenceFile"("evidenceId");
CREATE INDEX "EvidenceFile_sha256_idx" ON "EvidenceFile"("sha256");

-- AddForeignKey
ALTER TABLE "AuthToken" ADD CONSTRAINT "AuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceFile" ADD CONSTRAINT "EvidenceFile_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- URL evidence must keep its URL; only uploads may omit it.
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_url_required_for_url_kind" CHECK ("sourceKind" <> 'URL' OR "sourceUrl" IS NOT NULL);
