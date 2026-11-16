import { z } from "zod";

const severity = z.enum(["critical", "major", "minor"]);
const stance = z.enum(["SUPPORTS_YES", "SUPPORTS_NO", "NEUTRAL"]);

export const architectOutput = z.object({
  issues: z
    .array(
      z.object({
        code: z.string().min(2).max(40),
        severity,
        message: z.string().min(5).max(500),
        excerpt: z.string().max(200).optional(),
      }),
    )
    .max(15),
  improvedQuestion: z.string().min(15).max(400),
  yesCondition: z.string().min(10).max(800),
  noCondition: z.string().min(10).max(800),
  resolutionDeadline: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "must be an ISO-8601 date-time"),
  timezone: z.string().min(1).max(40),
  dataSource: z.string().min(3).max(200),
  dataSourceUrl: z.string().url().nullable(),
  methodology: z.string().min(20).max(2000),
  clarityScore: z.number().int().min(0).max(100),
  scoreRationale: z.string().min(10).max(1200),
  potentialDisputes: z.array(z.string().max(300)).max(8),
});
export type ArchitectOutput = z.infer<typeof architectOutput>;

export const evidenceOutput = z.object({
  summary: z.string().min(10).max(1200),
  stance,
  relevance: z.number().min(0).max(1),
  claims: z
    .array(
      z.object({
        text: z.string().min(5).max(400),
        supports: z.enum(["YES", "NO", "NEUTRAL"]),
        quote: z.string().min(8).max(400),
      }),
    )
    .max(8),
  reasoning: z.string().min(10).max(1500),
});
export type EvidenceOutput = z.infer<typeof evidenceOutput>;

export const resolutionOutput = z.object({
  recommendation: z.enum(["YES_SUPPORTED", "NO_SUPPORTED", "INCONCLUSIVE", "INSUFFICIENT_EVIDENCE"]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(20).max(3000),
  uncertainty: z.string().min(10).max(1500),
  missingInformation: z.array(z.string().max(300)).max(10),
  citedEvidenceIds: z.array(z.string().max(64)).max(30),
});
export type ResolutionOutput = z.infer<typeof resolutionOutput>;
