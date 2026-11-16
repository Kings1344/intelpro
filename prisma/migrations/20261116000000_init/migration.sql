-- IntelPro initial schema (PostgreSQL). Mirrors prisma/schema.prisma.

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'MARKET_CREATOR', 'REVIEWER', 'ADMIN');
CREATE TYPE "MarketStatus" AS ENUM ('DRAFT', 'ACTIVE', 'AWAITING_RESOLUTION', 'RESOLUTION_PROPOSED', 'DISPUTED', 'RESOLVED', 'CANCELLED');
CREATE TYPE "DataOrigin" AS ENUM ('DEMO', 'USER', 'PREDICT_DEVNET', 'PREDICT_MAINNET');
CREATE TYPE "Outcome" AS ENUM ('YES', 'NO');
CREATE TYPE "AnalysisEngine" AS ENUM ('AI', 'HEURISTIC');
CREATE TYPE "EvidenceStatus" AS ENUM ('SUBMITTED', 'ACCESSIBLE', 'ANALYSED', 'CORROBORATED', 'CONTRADICTED', 'UNABLE_TO_VERIFY');
CREATE TYPE "EvidenceStance" AS ENUM ('SUPPORTS_YES', 'SUPPORTS_NO', 'NEUTRAL', 'UNCLASSIFIED');
CREATE TYPE "EvidenceCategory" AS ENUM ('OFFICIAL_DATA', 'MARKET_DATA', 'ONCHAIN_DATA', 'NEWS_REPORT', 'OFFICIAL_STATEMENT', 'RESEARCH', 'SOCIAL_MEDIA', 'OTHER');
CREATE TYPE "Recommendation" AS ENUM ('YES_SUPPORTED', 'NO_SUPPORTED', 'INCONCLUSIVE', 'INSUFFICIENT_EVIDENCE');
CREATE TYPE "DisputeStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'EVIDENCE_REQUESTED', 'RESOLVED', 'REJECTED');
CREATE TYPE "CommentKind" AS ENUM ('COMMENT', 'EVIDENCE_REQUEST', 'DECISION', 'STATUS_CHANGE');
CREATE TYPE "TxKind" AS ENUM ('CRITERIA_ANCHOR', 'WALLET_TEST', 'PREDICT_SWAP', 'PREDICT_CREATE_MARKET', 'PREDICT_VAULT_COMMIT', 'PREDICT_RESOLVE');
CREATE TYPE "TxStatus" AS ENUM ('SUBMITTED', 'CONFIRMED', 'FINALIZED', 'FAILED', 'NOT_FOUND');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "network" TEXT NOT NULL DEFAULT 'devnet',
    "label" TEXT,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WalletNonce" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WalletNonce_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Market" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "status" "MarketStatus" NOT NULL DEFAULT 'DRAFT',
    "origin" "DataOrigin" NOT NULL DEFAULT 'USER',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "creatorId" TEXT,
    "resolutionDeadline" TIMESTAMP(3),
    "predictMarketPda" TEXT,
    "criteriaHash" TEXT,
    "anchorSignature" TEXT,
    "proposedOutcome" "Outcome",
    "finalOutcome" "Outcome",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Market_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketCriteria" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "originalQuestion" TEXT NOT NULL,
    "improvedQuestion" TEXT NOT NULL,
    "yesCondition" TEXT NOT NULL,
    "noCondition" TEXT NOT NULL,
    "resolutionDeadline" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "dataSource" TEXT NOT NULL,
    "dataSourceUrl" TEXT,
    "methodology" TEXT NOT NULL,
    "clarityScore" INTEGER NOT NULL,
    "issues" JSONB NOT NULL,
    "engine" "AnalysisEngine" NOT NULL,
    "model" TEXT,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketCriteria_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "submittedById" TEXT,
    "disputeId" TEXT,
    "title" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "category" "EvidenceCategory" NOT NULL DEFAULT 'OTHER',
    "claimedStance" "EvidenceStance" NOT NULL DEFAULT 'UNCLASSIFIED',
    "status" "EvidenceStatus" NOT NULL DEFAULT 'SUBMITTED',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "httpStatus" INTEGER,
    "contentHash" TEXT,
    "fetchedAt" TIMESTAMP(3),
    "fetchError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EvidenceAnalysis" (
    "id" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "engine" "AnalysisEngine" NOT NULL,
    "model" TEXT,
    "sourceAccessible" BOOLEAN NOT NULL,
    "excerpt" TEXT,
    "summary" TEXT NOT NULL,
    "stance" "EvidenceStance" NOT NULL,
    "relevance" DOUBLE PRECISION NOT NULL,
    "claims" JSONB NOT NULL,
    "reasoning" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvidenceAnalysis_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResolutionRecommendation" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "criteriaId" TEXT NOT NULL,
    "requestedById" TEXT,
    "recommendation" "Recommendation" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reasoning" TEXT NOT NULL,
    "uncertainty" TEXT NOT NULL,
    "missingInformation" JSONB NOT NULL,
    "citedEvidenceIds" TEXT[],
    "rejectedCitations" TEXT[],
    "engine" "AnalysisEngine" NOT NULL,
    "model" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ResolutionRecommendation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "recommendationId" TEXT,
    "challengerId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "reason" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'SUBMITTED',
    "decision" TEXT,
    "decidedAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DisputeComment" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "kind" "CommentKind" NOT NULL DEFAULT 'COMMENT',
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DisputeComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketActivity" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketActivity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "marketId" TEXT,
    "walletAddress" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "kind" "TxKind" NOT NULL,
    "status" "TxStatus" NOT NULL DEFAULT 'SUBMITTED',
    "slot" BIGINT,
    "blockTime" TIMESTAMP(3),
    "error" TEXT,
    "memo" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE UNIQUE INDEX "Wallet_address_key" ON "Wallet"("address");
CREATE INDEX "Wallet_userId_idx" ON "Wallet"("userId");
CREATE UNIQUE INDEX "WalletNonce_nonce_key" ON "WalletNonce"("nonce");
CREATE INDEX "WalletNonce_userId_address_idx" ON "WalletNonce"("userId", "address");
CREATE UNIQUE INDEX "Market_predictMarketPda_key" ON "Market"("predictMarketPda");
CREATE INDEX "Market_status_idx" ON "Market"("status");
CREATE INDEX "Market_category_idx" ON "Market"("category");
CREATE INDEX "Market_resolutionDeadline_idx" ON "Market"("resolutionDeadline");
CREATE INDEX "Market_isDemo_idx" ON "Market"("isDemo");
CREATE INDEX "MarketCriteria_marketId_approved_idx" ON "MarketCriteria"("marketId", "approved");
CREATE UNIQUE INDEX "MarketCriteria_marketId_version_key" ON "MarketCriteria"("marketId", "version");
CREATE INDEX "Evidence_marketId_createdAt_idx" ON "Evidence"("marketId", "createdAt");
CREATE INDEX "Evidence_status_idx" ON "Evidence"("status");
CREATE INDEX "Evidence_disputeId_idx" ON "Evidence"("disputeId");
CREATE INDEX "EvidenceAnalysis_evidenceId_createdAt_idx" ON "EvidenceAnalysis"("evidenceId", "createdAt");
CREATE INDEX "ResolutionRecommendation_marketId_createdAt_idx" ON "ResolutionRecommendation"("marketId", "createdAt");
CREATE INDEX "Dispute_marketId_idx" ON "Dispute"("marketId");
CREATE INDEX "Dispute_status_idx" ON "Dispute"("status");
CREATE INDEX "DisputeComment_disputeId_createdAt_idx" ON "DisputeComment"("disputeId", "createdAt");
CREATE INDEX "MarketActivity_marketId_createdAt_idx" ON "MarketActivity"("marketId", "createdAt");
CREATE INDEX "MarketActivity_createdAt_idx" ON "MarketActivity"("createdAt");
CREATE UNIQUE INDEX "Transaction_signature_key" ON "Transaction"("signature");
CREATE INDEX "Transaction_userId_createdAt_idx" ON "Transaction"("userId", "createdAt");
CREATE INDEX "Transaction_marketId_idx" ON "Transaction"("marketId");
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WalletNonce" ADD CONSTRAINT "WalletNonce_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Market" ADD CONSTRAINT "Market_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketCriteria" ADD CONSTRAINT "MarketCriteria_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketCriteria" ADD CONSTRAINT "MarketCriteria_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EvidenceAnalysis" ADD CONSTRAINT "EvidenceAnalysis_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResolutionRecommendation" ADD CONSTRAINT "ResolutionRecommendation_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResolutionRecommendation" ADD CONSTRAINT "ResolutionRecommendation_criteriaId_fkey" FOREIGN KEY ("criteriaId") REFERENCES "MarketCriteria"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResolutionRecommendation" ADD CONSTRAINT "ResolutionRecommendation_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "ResolutionRecommendation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_challengerId_fkey" FOREIGN KEY ("challengerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DisputeComment" ADD CONSTRAINT "DisputeComment_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DisputeComment" ADD CONSTRAINT "DisputeComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketActivity" ADD CONSTRAINT "MarketActivity_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketActivity" ADD CONSTRAINT "MarketActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
