import { z } from "zod";

// PR Intent types
export const prIntentTypeSchema = z.enum([
  "feature",
  "bugfix",
  "refactor",
  "docs",
  "test",
  "chore",
  "unknown",
]);

export type PRIntentType = z.infer<typeof prIntentTypeSchema>;

export const topFileSchema = z.object({
  path: z.string(),
  reason: z.string(),
});

// Intent classification
export const intentClassificationSchema = z.object({
  type: prIntentTypeSchema,
  confidence: z.number().min(0).max(1),
  summary: z.string().max(500),
  maintainerSummary: z.string().max(1200).optional(),
  overallConfidence: z.number().min(0).max(1).optional(),
  needsMaintainerAttention: z.boolean().optional(),
  contextNotes: z.array(z.string()).max(6).optional(),
  topFilesToInspect: z.array(topFileSchema).max(5).optional(),
});

export type IntentClassification = z.infer<typeof intentClassificationSchema>;

// AI Slop indicator types
export const aiSlopTypeSchema = z.enum([
  "over_engineering",
  "hallucinated_imports",
  "cargo_culted_patterns",
  "inflated_comments",
  "empty_functions",
  "unnecessary_abstraction",
]);

export const aiSlopIndicatorSchema = z.object({
  type: aiSlopTypeSchema,
  confidence: z.number().min(0).max(1),
  evidence: z.string(),
  location: z
    .object({
      file: z.string(),
      startLine: z.number().optional(),
      endLine: z.number().optional(),
    })
    .optional(),
});

export type AISlopIndicator = z.infer<typeof aiSlopIndicatorSchema>;

// Review suggestion
export const reviewSuggestionSchema = z.object({
  type: z.enum(["security", "performance", "maintainability", "testing", "style"]),
  severity: z.enum(["critical", "high", "medium", "low", "info"]),
  message: z.string(),
  whyItMatters: z.string().optional(),
  location: z
    .object({
      file: z.string(),
      startLine: z.number().optional(),
      endLine: z.number().optional(),
    })
    .optional(),
});

export type ReviewSuggestion = z.infer<typeof reviewSuggestionSchema>;
export type TopFile = z.infer<typeof topFileSchema>;

// Full analysis result
export const analysisResultSchema = z.object({
  intentClassification: intentClassificationSchema,
  valueScore: z.number().int().min(0).max(100),
  riskScore: z.number().int().min(0).max(100),
  aiSlopIndicators: z.array(aiSlopIndicatorSchema),
  reviewSuggestions: z.array(reviewSuggestionSchema),
});

export type AnalysisResult = z.infer<typeof analysisResultSchema>;

export const changedFileSchema = z.object({
  path: z.string(),
  status: z.enum(["added", "removed", "modified", "renamed", "copied"]),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  patch: z.string().optional(),
});

export type ChangedFile = z.infer<typeof changedFileSchema>;

export const contextFileExcerptSchema = z.object({
  path: z.string(),
  reason: z.string(),
  excerpt: z.string(),
});

export type ContextFileExcerpt = z.infer<typeof contextFileExcerptSchema>;

export const triageDecisionSchema = z.object({
  needsMoreContext: z.boolean(),
  reasoning: z.string().max(800),
  contextNotes: z.array(z.string()).max(6).default([]),
  topFilesToInspect: z.array(topFileSchema).max(5).default([]),
  contextFilesToRead: z.array(topFileSchema).max(5).default([]),
});

export type TriageDecision = z.infer<typeof triageDecisionSchema>;

// PR Context for analysis
export interface PRContext {
  repository: string;
  title: string;
  description: string | null;
  author: string;
  authorAssociation?: string | null;
  isFromFork?: boolean;
  commitCount?: number;
  baseBranch: string;
  filesChanged: number;
  additions: number;
  deletions: number;
  changedFilesDetail?: ChangedFile[];
}

// Provider interface
export interface AIProvider {
  name: string;
  generate(prompt: string): Promise<string>;
}
