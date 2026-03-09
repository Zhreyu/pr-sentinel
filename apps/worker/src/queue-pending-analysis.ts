/**
 * One-time script to queue analysis for PRs that have diffs but no analysis
 */
import { db } from "@pr-sentinel/database";
import { pullRequests, prDiffs, prAnalyses } from "@pr-sentinel/database/schema";
import { eq, isNull } from "drizzle-orm";
import { enqueuePRAnalysis } from "@pr-sentinel/queue";

async function main() {
  console.log("Finding PRs with diffs but no analysis...");

  // Get all PRs that have diffs
  const prsWithDiffs = await db
    .select({
      id: pullRequests.id,
      repositoryId: pullRequests.repositoryId,
      headSha: pullRequests.headSha,
      title: pullRequests.title,
    })
    .from(pullRequests)
    .innerJoin(prDiffs, eq(prDiffs.pullRequestId, pullRequests.id))
    .leftJoin(prAnalyses, eq(prAnalyses.pullRequestId, pullRequests.id))
    .where(isNull(prAnalyses.id));

  console.log(`Found ${prsWithDiffs.length} PRs needing analysis`);

  for (const pr of prsWithDiffs) {
    console.log(`Queueing analysis for: ${pr.title}`);
    await enqueuePRAnalysis({
      pullRequestId: pr.id,
      repositoryId: pr.repositoryId,
      headSha: pr.headSha,
      priority: "normal",
    });
  }

  console.log("Done! Analysis jobs queued.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
