import {
  pgTable,
  uuid,
  bigint,
  integer,
  smallint,
  varchar,
  text,
  boolean,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { repositories } from "./repositories";

// PR Intent Classification types
export type PRIntentType = "feature" | "bugfix" | "refactor" | "docs" | "test" | "chore" | "unknown";

export interface IntentClassification {
  type: PRIntentType;
  confidence: number;
  summary: string;
}

export interface AISlopIndicator {
  type:
    | "over_engineering"
    | "hallucinated_imports"
    | "cargo_culted_patterns"
    | "inflated_comments"
    | "empty_functions"
    | "unnecessary_abstraction";
  confidence: number;
  evidence: string;
  location?: {
    file: string;
    startLine?: number;
    endLine?: number;
  };
}

export interface ReviewSuggestion {
  type: "security" | "performance" | "maintainability" | "testing" | "style";
  severity: "critical" | "high" | "medium" | "low" | "info";
  message: string;
  location?: {
    file: string;
    startLine?: number;
    endLine?: number;
  };
}

export interface FileChange {
  path: string;
  additions: number;
  deletions: number;
  status: "added" | "removed" | "modified" | "renamed" | "copied";
}

// Pull Requests table
export const pullRequests = pgTable(
  "pull_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    githubPrId: bigint("github_pr_id", { mode: "number" }).notNull(),
    githubPrNumber: integer("github_pr_number").notNull(),

    // Core PR data
    title: varchar("title", { length: 500 }).notNull(),
    body: text("body"),
    state: varchar("state", { length: 50 }).notNull(), // 'open', 'closed', 'merged'
    draft: boolean("draft").notNull().default(false),

    // Author info (denormalized for query performance)
    authorGithubId: bigint("author_github_id", { mode: "number" }).notNull(),
    authorLogin: varchar("author_login", { length: 255 }).notNull(),

    // Git info
    headSha: varchar("head_sha", { length: 40 }).notNull(),
    baseSha: varchar("base_sha", { length: 40 }).notNull(),
    headRef: varchar("head_ref", { length: 255 }).notNull(),
    baseRef: varchar("base_ref", { length: 255 }).notNull(),

    // Metrics
    additions: integer("additions").notNull().default(0),
    deletions: integer("deletions").notNull().default(0),
    changedFiles: integer("changed_files").notNull().default(0),

    // Timestamps (stored as Unix timestamps for efficiency)
    githubCreatedAt: integer("github_created_at").notNull(),
    githubUpdatedAt: integer("github_updated_at").notNull(),
    githubMergedAt: integer("github_merged_at"),
    githubClosedAt: integer("github_closed_at"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_pull_requests_repo_pr").on(table.repositoryId, table.githubPrNumber),
    index("idx_pull_requests_author").on(table.authorGithubId),
    index("idx_pull_requests_state_open").on(table.state).where(sql`state = 'open'`),
    index("idx_pull_requests_updated").on(table.githubUpdatedAt),
  ]
);

// PR Analyses table
export const prAnalyses = pgTable(
  "pr_analyses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pullRequestId: uuid("pull_request_id")
      .notNull()
      .references(() => pullRequests.id, { onDelete: "cascade" }),
    analysisVersion: smallint("analysis_version").notNull().default(1),

    // Analysis results
    intentClassification: jsonb("intent_classification").notNull().$type<IntentClassification>(),
    valueScore: smallint("value_score").notNull(), // 0-100
    riskScore: smallint("risk_score").notNull(), // 0-100
    aiSlopIndicators: jsonb("ai_slop_indicators").default([]).$type<AISlopIndicator[]>(),
    reviewSuggestions: jsonb("review_suggestions").default([]).$type<ReviewSuggestion[]>(),

    // AI metadata
    modelUsed: varchar("model_used", { length: 100 }).notNull(),
    promptVersion: varchar("prompt_version", { length: 50 }).notNull(),
    tokensUsed: integer("tokens_used"),
    analysisDurationMs: integer("analysis_duration_ms"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_pr_analyses_priority").on(
      table.pullRequestId,
      sql`(value_score - risk_score) DESC`,
      table.createdAt
    ),
  ]
);

// PR Diffs table (compressed storage)
export const prDiffs = pgTable("pr_diffs", {
  id: uuid("id").primaryKey().defaultRandom(),
  pullRequestId: uuid("pull_request_id")
    .notNull()
    .references(() => pullRequests.id, { onDelete: "cascade" }),
  headSha: varchar("head_sha", { length: 40 }).notNull(),

  // Compressed diff (gzip)
  diffCompressed: text("diff_compressed").notNull(), // Base64 encoded gzip
  diffSizeOriginal: integer("diff_size_original").notNull(),

  // File-level metadata for quick queries
  filesChanged: jsonb("files_changed").notNull().$type<FileChange[]>(),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PullRequest = typeof pullRequests.$inferSelect;
export type NewPullRequest = typeof pullRequests.$inferInsert;
export type PRAnalysis = typeof prAnalyses.$inferSelect;
export type NewPRAnalysis = typeof prAnalyses.$inferInsert;
export type PRDiff = typeof prDiffs.$inferSelect;
export type NewPRDiff = typeof prDiffs.$inferInsert;
