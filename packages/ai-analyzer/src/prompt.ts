import type { PRContext } from "./types";

const MAX_DIFF_LENGTH = 100000;

/**
 * Truncate diff if too large
 */
function truncateDiff(diff: string, maxLength: number): string {
  if (diff.length <= maxLength) {
    return diff;
  }
  return diff.slice(0, maxLength) + "\n\n[... diff truncated due to size ...]";
}

/**
 * Build the analysis prompt for the AI
 */
export function buildAnalysisPrompt(diff: string, context: PRContext): string {
  const truncatedDiff = truncateDiff(diff, MAX_DIFF_LENGTH);

  return `You are an expert code reviewer analyzing a pull request. Your task is to provide a structured analysis of the changes.

<context>
Repository: ${context.repository}
PR Title: ${context.title}
PR Description: ${context.description || "(No description provided)"}
Author: ${context.author}
Base Branch: ${context.baseBranch}
Files Changed: ${context.filesChanged}
Lines Added: ${context.additions}
Lines Removed: ${context.deletions}
</context>

<diff>
${truncatedDiff}
</diff>

Analyze this pull request and provide your assessment in the following JSON format:

<output_format>
{
  "intentClassification": {
    "type": "feature|bugfix|refactor|docs|test|chore|unknown",
    "confidence": 0.0-1.0,
    "summary": "One-sentence summary of what this PR does"
  },
  "valueScore": 0-100,
  "riskScore": 0-100,
  "aiSlopIndicators": [
    {
      "type": "over_engineering|hallucinated_imports|cargo_culted_patterns|inflated_comments|empty_functions|unnecessary_abstraction",
      "confidence": 0.0-1.0,
      "evidence": "Specific code snippet or pattern",
      "location": {"file": "path/to/file.ts", "startLine": 10, "endLine": 20}
    }
  ],
  "reviewSuggestions": [
    {
      "type": "security|performance|maintainability|testing|style",
      "severity": "critical|high|medium|low|info",
      "message": "Specific actionable suggestion",
      "location": {"file": "path/to/file.ts", "startLine": 10}
    }
  ]
}
</output_format>

<scoring_criteria>
VALUE SCORE (0-100):
- 90-100: Critical bug fix, major feature, significant improvement
- 70-89: Important feature, good refactor, meaningful improvement
- 50-69: Minor feature, small improvements, routine changes
- 30-49: Low-value changes, minor cleanup
- 0-29: Trivial changes, unnecessary modifications

RISK SCORE (0-100):
- 90-100: Breaking changes, security implications, data loss risk
- 70-89: Complex changes to critical paths, database migrations
- 50-69: Moderate complexity, some edge case risks
- 30-49: Low risk, well-tested areas
- 0-29: Minimal risk, documentation or test-only changes

AI SLOP INDICATORS (signs of low-quality AI-generated code):
- over_engineering: Simple problem solved with excessive abstraction
- hallucinated_imports: Imports that don't exist or aren't needed
- cargo_culted_patterns: Patterns copied without understanding (Redux for a todo list)
- inflated_comments: Verbose documentation that doesn't add value
- empty_functions: Stubs or TODO placeholders without implementation
- unnecessary_abstraction: Premature generalization without 3+ use cases
</scoring_criteria>

Provide your analysis as valid JSON only, with no additional text before or after.`;
}

/**
 * Extract JSON from potentially wrapped response
 */
export function extractJSON(text: string): string {
  // Try to find JSON in the response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON found in response");
  }
  return jsonMatch[0];
}
