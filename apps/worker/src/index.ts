import { createPRAnalysisWorker, createDiffFetchWorker, enqueuePRAnalysis } from "@pr-sentinel/queue";
import { getPullRequestDiff, getPullRequestFiles } from "@pr-sentinel/github";
import { runAnalysisPipeline, compressDiff, type PRContext } from "@pr-sentinel/ai-analyzer";
import { db } from "@pr-sentinel/database";
import {
  pullRequests,
  prAnalyses,
  prDiffs,
  repositories,
  organizations,
} from "@pr-sentinel/database/schema";
import { eq } from "drizzle-orm";
import type { Job } from "bullmq";
import type { PRAnalysisJob, DiffFetchJob } from "@pr-sentinel/queue";

console.log("Starting PR Sentinel worker...");

// Diff fetch worker - fetches and stores PR diffs
const diffFetchWorker = createDiffFetchWorker(async (job: Job<DiffFetchJob>) => {
  const { pullRequestId, installationId, owner, repo, prNumber } = job.data;

  console.log(`[DiffFetch] Processing PR ${owner}/${repo}#${prNumber}`);

  try {
    // Fetch the diff from GitHub
    const diff = await getPullRequestDiff(installationId, owner, repo, prNumber);
    const files = await getPullRequestFiles(installationId, owner, repo, prNumber);

    // Get the current head SHA
    const pr = await db
      .select()
      .from(pullRequests)
      .where(eq(pullRequests.id, pullRequestId))
      .limit(1)
      .then((rows) => rows[0]);

    if (!pr) {
      throw new Error(`PR ${pullRequestId} not found`);
    }

    // Compress and store the diff
    const { compressed, originalSize } = await compressDiff(diff);

    // Check if we already have this diff
    const existingDiff = await db
      .select()
      .from(prDiffs)
      .where(eq(prDiffs.pullRequestId, pullRequestId))
      .limit(1)
      .then((rows) => rows[0]);

    const filesChanged = files.map((f) => ({
      path: f.filename,
      additions: f.additions,
      deletions: f.deletions,
      status: f.status as "added" | "removed" | "modified" | "renamed" | "copied",
    }));

    if (existingDiff) {
      // Update existing diff if SHA changed
      if (existingDiff.headSha !== pr.headSha) {
        await db
          .update(prDiffs)
          .set({
            headSha: pr.headSha,
            diffCompressed: compressed,
            diffSizeOriginal: originalSize,
            filesChanged,
          })
          .where(eq(prDiffs.id, existingDiff.id));
      }
    } else {
      // Insert new diff
      await db.insert(prDiffs).values({
        pullRequestId,
        headSha: pr.headSha,
        diffCompressed: compressed,
        diffSizeOriginal: originalSize,
        filesChanged,
      });
    }

    console.log(`[DiffFetch] Stored diff for PR ${owner}/${repo}#${prNumber} (${originalSize} bytes)`);

    // Queue AI analysis job
    await enqueuePRAnalysis({
      pullRequestId,
      repositoryId: pr.repositoryId,
      headSha: pr.headSha,
      priority: "normal",
    });
    console.log(`[DiffFetch] Queued analysis for PR ${owner}/${repo}#${prNumber}`);
  } catch (error) {
    console.error(`[DiffFetch] Error processing PR ${pullRequestId}:`, error);
    throw error;
  }
});

// PR analysis worker - runs AI analysis on PRs
const prAnalysisWorker = createPRAnalysisWorker(async (job: Job<PRAnalysisJob>) => {
  const { pullRequestId, repositoryId, headSha } = job.data;

  console.log(`[Analysis] Processing PR ${pullRequestId}`);

  try {
    // Fetch PR, repo, and diff data
    const pr = await db
      .select()
      .from(pullRequests)
      .where(eq(pullRequests.id, pullRequestId))
      .limit(1)
      .then((rows) => rows[0]);

    if (!pr) {
      throw new Error(`PR ${pullRequestId} not found`);
    }

    const repo = await db
      .select()
      .from(repositories)
      .where(eq(repositories.id, repositoryId))
      .limit(1)
      .then((rows) => rows[0]);

    if (!repo) {
      throw new Error(`Repository ${repositoryId} not found`);
    }

    // Get the diff
    const diffData = await db
      .select()
      .from(prDiffs)
      .where(eq(prDiffs.pullRequestId, pullRequestId))
      .limit(1)
      .then((rows) => rows[0]);

    if (!diffData) {
      console.log(`[Analysis] No diff found for PR ${pullRequestId}, skipping analysis`);
      return;
    }

    // Decompress the diff
    const { decompressDiff } = await import("@pr-sentinel/ai-analyzer");
    const diff = await decompressDiff(diffData.diffCompressed);

    // Build PR context
    const context: PRContext = {
      repository: repo.githubFullName,
      title: pr.title,
      description: pr.body,
      author: pr.authorLogin,
      baseBranch: pr.baseRef,
      filesChanged: pr.changedFiles,
      additions: pr.additions,
      deletions: pr.deletions,
    };

    // Run analysis pipeline
    const result = await runAnalysisPipeline({ diff, context });

    // Store analysis results
    await db.insert(prAnalyses).values({
      pullRequestId,
      intentClassification: result.analysis.intentClassification,
      valueScore: result.analysis.valueScore,
      riskScore: result.analysis.riskScore,
      aiSlopIndicators: result.analysis.aiSlopIndicators,
      reviewSuggestions: result.analysis.reviewSuggestions,
      modelUsed: result.modelUsed,
      promptVersion: result.promptVersion,
      tokensUsed: result.tokensUsed,
      analysisDurationMs: result.durationMs,
    });

    console.log(
      `[Analysis] Completed PR ${pullRequestId}: value=${result.analysis.valueScore}, risk=${result.analysis.riskScore}`
    );
  } catch (error) {
    console.error(`[Analysis] Error processing PR ${pullRequestId}:`, error);
    throw error;
  }
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("Shutting down workers...");
  await Promise.all([diffFetchWorker.close(), prAnalysisWorker.close()]);
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("Shutting down workers...");
  await Promise.all([diffFetchWorker.close(), prAnalysisWorker.close()]);
  process.exit(0);
});

console.log("Worker started. Waiting for jobs...");
