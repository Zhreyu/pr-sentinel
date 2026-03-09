import type { ContextFileExcerpt, PRContext, TriageDecision } from "./types";

const MAX_DIFF_LENGTH = 100000;
const MAX_PATCH_LENGTH = 1600;

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
 * Build the triage prompt for deciding whether more repo context is needed.
 */
export function buildTriagePrompt(diff: string, context: PRContext, repoContext?: string): string {
  const truncatedDiff = truncateDiff(diff, MAX_DIFF_LENGTH);
  const changedFiles = formatChangedFiles(context);
  const repoNotes = repoContext
    ? `\n<repo_context>\n${repoContext}\n</repo_context>\n`
    : "\n<repo_context>\n(No repo context snapshot provided)\n</repo_context>\n";

  return `You are an expert code reviewer analyzing a pull request. Your task is to provide a structured analysis of the changes.

<context>
Repository: ${context.repository}
PR Title: ${context.title}
PR Description: ${context.description || "(No description provided)"}
Author: ${context.author}
Author Association: ${context.authorAssociation || "unknown"}
From Fork: ${context.isFromFork ? "yes" : "no"}
Commit Count: ${context.commitCount ?? "unknown"}
Base Branch: ${context.baseBranch}
Files Changed: ${context.filesChanged}
Lines Added: ${context.additions}
Lines Removed: ${context.deletions}
</context>

${repoNotes}

<changed_files>
${changedFiles}
</changed_files>

<diff>
${truncatedDiff}
</diff>

Decide whether the diff alone is enough or whether you need more repository context from specific files.

Rules:
- Ask for more context only when it will materially improve review quality.
- Prefer at most 5 files.
- Prioritize files that explain architecture, touched dependencies, tests, config, routing, schema, or adjacent modules.
- If the PR is straightforward and self-contained, do not request extra files.
- Use contributor signals intelligently:
  - first-time contributors and external contributors often need more architectural context before judging correctness
  - maintainer-authored PRs may need less background context, but still require scrutiny when they touch critical paths
  - fork PRs deserve extra attention for integration risk, missing local conventions, and uncertainty

Return valid JSON only in this shape:

<output_format>
{
  "needsMoreContext": true,
  "reasoning": "Short explanation of why extra context is or is not needed",
  "contextNotes": [
    "1-6 short notes about risky areas, uncertainty, or review focus"
  ],
  "topFilesToInspect": [
    {
      "path": "src/foo.ts",
      "reason": "Why this file matters for manual review"
    }
  ],
  "contextFilesToRead": [
    {
      "path": "src/bar.ts",
      "reason": "Why reading this file would reduce uncertainty"
    }
  ]
}
</output_format>

Be evidence-driven, conservative, and concise.`;
}

/**
 * Build the final analysis prompt for the AI.
 */
export function buildAnalysisPrompt(
  diff: string,
  context: PRContext,
  triage: TriageDecision,
  repoContext?: string,
  extraContextFiles: ContextFileExcerpt[] = []
): string {
  const truncatedDiff = truncateDiff(diff, MAX_DIFF_LENGTH);
  const changedFiles = formatChangedFiles(context);
  const extraFiles = extraContextFiles.length > 0 ? formatContextFiles(extraContextFiles) : "(No extra files fetched)";

  return `You are an expert code reviewer analyzing a pull request for a maintainer-facing dashboard.

Your job is not only to review code quality, but to help a maintainer decide how much attention this PR deserves and why.

<context>
Repository: ${context.repository}
PR Title: ${context.title}
PR Description: ${context.description || "(No description provided)"}
Author: ${context.author}
Author Association: ${context.authorAssociation || "unknown"}
From Fork: ${context.isFromFork ? "yes" : "no"}
Commit Count: ${context.commitCount ?? "unknown"}
Base Branch: ${context.baseBranch}
Files Changed: ${context.filesChanged}
Lines Added: ${context.additions}
Lines Removed: ${context.deletions}
</context>

<repo_context>
${repoContext || "(No repo context snapshot provided)"}
</repo_context>

<triage_notes>
Reasoning: ${triage.reasoning}
Context Notes:
${triage.contextNotes.map((note) => `- ${note}`).join("\n") || "- none"}
</triage_notes>

<changed_files>
${changedFiles}
</changed_files>

<extra_context_files>
${extraFiles}
</extra_context_files>

<diff>
${truncatedDiff}
</diff>

Return valid JSON only in this format:

<output_format>
{
  "intentClassification": {
    "type": "feature|bugfix|refactor|docs|test|chore|unknown",
    "confidence": 0.0-1.0,
    "summary": "One-sentence summary of what this PR does",
    "maintainerSummary": "2-4 sentence maintainer-facing summary of what matters most",
    "overallConfidence": 0.0-1.0,
    "needsMaintainerAttention": true,
    "contextNotes": [
      "Short bullets about architecture, uncertainty, or what drove the scoring"
    ],
    "topFilesToInspect": [
      {
        "path": "src/foo.ts",
        "reason": "Why this file deserves maintainer attention"
      }
    ]
  },
  "valueScore": 0-100,
  "riskScore": 0-100,
  "aiSlopIndicators": [
    {
      "type": "over_engineering|hallucinated_imports|cargo_culted_patterns|inflated_comments|empty_functions|unnecessary_abstraction",
      "confidence": 0.0-1.0,
      "evidence": "Specific evidence",
      "location": {"file": "path/to/file.ts", "startLine": 10, "endLine": 20}
    }
  ],
  "reviewSuggestions": [
    {
      "type": "security|performance|maintainability|testing|style",
      "severity": "critical|high|medium|low|info",
      "message": "Specific actionable suggestion",
      "whyItMatters": "Why this matters for the maintainer",
      "location": {"file": "path/to/file.ts", "startLine": 10}
    }
  ]
}
</output_format>

Scoring guidance:
- Value should reflect project impact, user value, bug-fix importance, and meaningful maintenance improvements.
- Risk should reflect merge danger, critical-path impact, hidden complexity, configuration changes, data impact, auth/security concerns, and missing tests.
- intentClassification.overallConfidence should be lower when the diff is truncated, context is missing, or architecture is unclear.
- intentClassification.needsMaintainerAttention should be true when the PR touches critical paths, has elevated risk, introduces uncertainty, or deserves human inspection despite being valuable.
- Use contributor context in the maintainer summary:
  - mention when a PR comes from a first-time or external contributor and why that changes review needs
  - mention when a maintainer-authored PR still deserves review because it touches risky or uncertain areas
  - fork PRs should increase caution when configuration, integrations, or architecture are involved
- Only report AI slop indicators when you have real evidence.

Provide valid JSON only.`;
}

export function buildRepoContextPrompt(input: {
  repository: string;
  defaultBranch: string;
  rootEntries: string[];
  files: Array<{ path: string; content: string }>;
}): string {
  const fileSections = input.files
    .map((file) => `## ${file.path}\n${truncateDiff(file.content, 5000)}`)
    .join("\n\n");

  return `You are preparing a repository context document for an AI pull-request reviewer.

Write a concise but information-dense markdown document that helps future PR analysis understand how this repository works.

<repository>
Name: ${input.repository}
Default Branch: ${input.defaultBranch}
</repository>

<root_entries>
${input.rootEntries.map((entry) => `- ${entry}`).join("\n")}
</root_entries>

<sample_files>
${fileSections}
</sample_files>

Write markdown with these sections only:

# Repository Overview
# Tech Stack
# Important Directories
# Architecture Notes
# Critical Paths
# Review Heuristics

Rules:
- Be specific to the repository evidence provided.
- Do not invent systems that are not visible.
- Mention uncertainty explicitly when the repository shape is unclear.
- Prefer terse bullets and short paragraphs over long prose.
- Focus on information that would improve PR review quality.

Return markdown only.`;
}

function formatChangedFiles(context: PRContext): string {
  const files = context.changedFilesDetail ?? [];
  if (files.length === 0) {
    return "(No changed file details available)";
  }

  return files
    .map((file) => {
      const patch = file.patch ? truncateDiff(file.patch, MAX_PATCH_LENGTH) : "(No patch excerpt)";
      return `- ${file.path} [${file.status}] +${file.additions}/-${file.deletions}\n${patch}`;
    })
    .join("\n\n");
}

function formatContextFiles(files: ContextFileExcerpt[]): string {
  return files
    .map(
      (file) => `### ${file.path}\nReason: ${file.reason}\n${truncateDiff(file.excerpt, MAX_PATCH_LENGTH)}`
    )
    .join("\n\n");
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
