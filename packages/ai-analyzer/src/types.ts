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

// Intent classification
export const intentClassificationSchema = z.object({
  type: prIntentTypeSchema,
  confidence: z.number().min(0).max(1),
  summary: z.string().max(500),
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
  location: z
    .object({
      file: z.string(),
      startLine: z.number().optional(),
      endLine: z.number().optional(),
    })
    .optional(),
});

export type ReviewSuggestion = z.infer<typeof reviewSuggestionSchema>;

// Full analysis result
export const analysisResultSchema = z.object({
  intentClassification: intentClassificationSchema,
  valueScore: z.number().int().min(0).max(100),
  riskScore: z.number().int().min(0).max(100),
  aiSlopIndicators: z.array(aiSlopIndicatorSchema),
  reviewSuggestions: z.array(reviewSuggestionSchema),
});

export type AnalysisResult = z.infer<typeof analysisResultSchema>;

// PR Context for analysis
export interface PRContext {
  repository: string;
  title: string;
  description: string | null;
  author: string;
  baseBranch: string;
  filesChanged: number;
  additions: number;
  deletions: number;
}

// Provider interface
export interface AIProvider {
  name: string;
  analyze(diff: string, context: PRContext): Promise<AnalysisResult>;
}
