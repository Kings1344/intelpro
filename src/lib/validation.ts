import { z } from "zod";
import { isSolanaAddress, isSolanaSignature } from "./solana/base58";

const trimmed = (min: number, max: number) => z.string().trim().min(min).max(max);
const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "Must be an ISO-8601 date");
const httpUrl = z
  .string()
  .trim()
  .url()
  .max(2000)
  .refine((u) => /^https?:\/\//i.test(u), "Only http(s) URLs are allowed");

export const solanaAddress = z.string().trim().refine(isSolanaAddress, "Invalid Solana address");
export const solanaSignature = z.string().trim().refine(isSolanaSignature, "Invalid transaction signature");

export const registerSchema = z.object({
  name: trimmed(2, 80),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(10).max(200),
});
export const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) });

export const CATEGORIES = ["Crypto", "Macro", "Politics", "Sports", "Technology", "Science", "Culture", "Other"] as const;
export const EVIDENCE_CATEGORIES = ["OFFICIAL_DATA", "MARKET_DATA", "ONCHAIN_DATA", "NEWS_REPORT", "OFFICIAL_STATEMENT", "RESEARCH", "SOCIAL_MEDIA", "OTHER"] as const;
export const STANCES = ["SUPPORTS_YES", "SUPPORTS_NO", "NEUTRAL", "UNCLASSIFIED"] as const;

export const analyseQuestionSchema = z.object({ question: trimmed(10, 500) });

const issue = z.object({
  code: z.string().max(40),
  severity: z.enum(["critical", "major", "minor"]),
  message: z.string().max(500),
  excerpt: z.string().max(200).optional(),
});

export const criteriaInput = z.object({
  originalQuestion: trimmed(10, 500),
  improvedQuestion: trimmed(15, 400),
  yesCondition: trimmed(10, 800),
  noCondition: trimmed(10, 800),
  resolutionDeadline: isoDate,
  timezone: trimmed(1, 40).default("UTC"),
  dataSource: trimmed(3, 200),
  dataSourceUrl: httpUrl.nullable().optional(),
  methodology: trimmed(20, 2000),
  clarityScore: z.number().int().min(0).max(100),
  issues: z.array(issue).max(30),
  engine: z.enum(["AI", "HEURISTIC"]),
  model: z.string().max(80).nullable().optional(),
});

export const createMarketSchema = z.object({
  category: z.enum(CATEGORIES),
  description: z.string().trim().max(2000).optional(),
  criteria: criteriaInput,
  approve: z.boolean().default(false),
});

export const newCriteriaVersionSchema = z.object({ criteria: criteriaInput, approve: z.boolean().default(false) });

export const evidenceInput = z.object({
  title: trimmed(3, 200),
  sourceName: trimmed(2, 120),
  sourceUrl: httpUrl,
  description: trimmed(10, 2000),
  publishedAt: isoDate.nullable().optional(),
  category: z.enum(EVIDENCE_CATEGORIES),
  claimedStance: z.enum(STANCES).default("UNCLASSIFIED"),
});

/** Metadata for an uploaded PDF (multipart form fields). The original URL is optional. */
export const pdfEvidenceInput = evidenceInput.extend({
  sourceUrl: httpUrl.optional().or(z.literal("").transform(() => undefined)),
});

export const proposeResolutionSchema = z.object({ outcome: z.enum(["YES", "NO"]), recommendationId: z.string().min(1).max(40) });

export const createDisputeSchema = z.object({
  marketId: z.string().min(1).max(40),
  recommendationId: z.string().min(1).max(40).optional(),
  reason: trimmed(20, 3000),
  evidence: z.array(evidenceInput).max(5).default([]),
});

export const disputeActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start_review") }),
  z.object({ action: z.literal("comment"), body: trimmed(2, 3000) }),
  z.object({ action: z.literal("request_evidence"), body: trimmed(5, 3000) }),
  z.object({ action: z.literal("decide"), decision: z.enum(["UPHOLD", "REJECT"]), body: trimmed(10, 3000) }),
  z.object({ action: z.literal("add_evidence"), evidence: evidenceInput }),
]);

export const walletNonceSchema = z.object({ address: solanaAddress });
export const walletVerifySchema = z.object({ address: solanaAddress, nonce: z.string().min(16).max(64), signature: z.string().min(80).max(100) });

export const recordTxSchema = z.object({
  signature: solanaSignature,
  kind: z.enum(["CRITERIA_ANCHOR", "WALLET_TEST", "PREDICT_SWAP", "PREDICT_CREATE_MARKET", "PREDICT_VAULT_COMMIT", "PREDICT_RESOLVE"]),
  marketId: z.string().max(40).optional(),
  walletAddress: solanaAddress,
});

export const linkPredictSchema = z.object({ marketPda: solanaAddress, signature: solanaSignature, walletAddress: solanaAddress, viaVault: z.boolean().default(false) });

export const marketListQuery = z.object({
  q: z.string().max(200).optional(),
  category: z.string().max(40).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "AWAITING_RESOLUTION", "RESOLUTION_PROPOSED", "DISPUTED", "RESOLVED", "CANCELLED"]).optional().or(z.literal("").transform(() => undefined)),
  integrity: z.enum(["HEALTHY", "NEEDS_ATTENTION", "HIGH_RISK", "UNDER_DISPUTE"]).optional().or(z.literal("").transform(() => undefined)),
  resolves: z.enum(["7d", "30d", "90d", "past"]).optional().or(z.literal("").transform(() => undefined)),
  demo: z.enum(["include", "exclude", "only"]).default("include"),
});

export const roleUpdateSchema = z.object({ role: z.enum(["USER", "MARKET_CREATOR", "REVIEWER", "ADMIN"]) });
export const profileUpdateSchema = z.object({ name: trimmed(2, 80) });
export const notificationReadSchema = z.object({ ids: z.array(z.string().max(40)).max(200).optional(), all: z.boolean().optional() });
