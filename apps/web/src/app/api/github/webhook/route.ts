import { NextRequest, NextResponse } from "next/server";
import {
  verifyWebhookSignature,
  extractPRData,
  type PRWebhookPayload,
} from "@pr-sentinel/github";
import { db } from "@pr-sentinel/database";
import { repositories, pullRequests, organizations } from "@pr-sentinel/database/schema";
import { eq, and } from "drizzle-orm";
import { enqueueDiffFetch } from "@pr-sentinel/queue";

export async function POST(request: NextRequest) {
  const signature = request.headers.get("x-hub-signature-256");
  const event = request.headers.get("x-github-event");
  const deliveryId = request.headers.get("x-github-delivery");

  if (!signature || !event) {
    return NextResponse.json({ error: "Missing required headers" }, { status: 400 });
  }

  const body = await request.text();

  // Verify signature
  const isValid = await verifyWebhookSignature(body, signature);
  if (!isValid) {
    console.error("Invalid webhook signature", { deliveryId });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Handle ping event (sent when webhook is first configured)
  if (event === "ping") {
    console.log("GitHub webhook ping received", { deliveryId });
    return NextResponse.json({ message: "pong" });
  }

  // Only handle pull_request events for now
  if (event !== "pull_request") {
    return NextResponse.json({ message: `Event ${event} ignored` });
  }

  try {
    const payload = JSON.parse(body) as PRWebhookPayload;
    const data = extractPRData(payload);

    // Skip if no installation ID (shouldn't happen for GitHub App webhooks)
    if (!data.installationId) {
      console.warn("No installation ID in webhook payload", { deliveryId });
      return NextResponse.json({ error: "No installation ID" }, { status: 400 });
    }

    // Find or create organization
    let org = await db
      .select()
      .from(organizations)
      .where(eq(organizations.githubInstallationId, data.installationId))
      .limit(1)
      .then((rows) => rows[0]);

    if (!org) {
      // Create organization for this installation
      const orgName = data.repository.fullName.split("/")[0] ?? "Unknown";
      const newOrg = await db
        .insert(organizations)
        .values({
          name: orgName,
          githubInstallationId: data.installationId,
          githubOrgId: data.repository.id, // Use repo ID as placeholder
          githubOrgLogin: orgName,
        })
        .returning();
      org = newOrg[0];
    }

    if (!org) {
      throw new Error("Failed to get or create organization");
    }

    // Find or create repository
    let repo = await db
      .select()
      .from(repositories)
      .where(
        and(
          eq(repositories.organizationId, org.id),
          eq(repositories.githubRepoId, data.repository.id)
        )
      )
      .limit(1)
      .then((rows) => rows[0]);

    if (!repo) {
      const newRepo = await db
        .insert(repositories)
        .values({
          organizationId: org.id,
          githubRepoId: data.repository.id,
          githubFullName: data.repository.fullName,
          defaultBranch: data.repository.defaultBranch,
          isActive: true,
        })
        .returning();
      repo = newRepo[0];
    }

    if (!repo) {
      throw new Error("Failed to get or create repository");
    }

    // Handle PR action
    const pr = data.pullRequest;

    switch (data.action) {
      case "opened":
      case "synchronize":
      case "reopened": {
        // Create or update pull request
        const existingPR = await db
          .select()
          .from(pullRequests)
          .where(
            and(
              eq(pullRequests.repositoryId, repo.id),
              eq(pullRequests.githubPrId, pr.id)
            )
          )
          .limit(1)
          .then((rows) => rows[0]);

        if (existingPR) {
          // Update existing PR
          await db
            .update(pullRequests)
            .set({
              title: pr.title,
              body: pr.body,
              state: pr.state,
              draft: pr.draft,
              headSha: pr.headSha,
              baseSha: pr.baseSha,
              additions: pr.additions,
              deletions: pr.deletions,
              changedFiles: pr.changedFiles,
              githubUpdatedAt: pr.updatedAt,
              updatedAt: new Date(),
            })
            .where(eq(pullRequests.id, existingPR.id));

          console.log("Updated PR", { prId: existingPR.id, action: data.action });
        } else {
          // Create new PR
          const newPR = await db
            .insert(pullRequests)
            .values({
              repositoryId: repo.id,
              githubPrId: pr.id,
              githubPrNumber: pr.number,
              title: pr.title,
              body: pr.body,
              state: pr.state,
              draft: pr.draft,
              authorGithubId: pr.authorId,
              authorLogin: pr.authorLogin,
              headSha: pr.headSha,
              baseSha: pr.baseSha,
              headRef: pr.headRef,
              baseRef: pr.baseRef,
              additions: pr.additions,
              deletions: pr.deletions,
              changedFiles: pr.changedFiles,
              githubCreatedAt: pr.createdAt,
              githubUpdatedAt: pr.updatedAt,
            })
            .returning({ id: pullRequests.id });

          const createdPrId = newPR[0]?.id;
          console.log("Created PR", { prId: createdPrId, action: data.action });

          // Queue diff fetch job
          if (createdPrId && data.installationId) {
            const [owner, repoName] = data.repository.fullName.split("/");
            await enqueueDiffFetch({
              pullRequestId: createdPrId,
              installationId: data.installationId,
              owner: owner ?? "",
              repo: repoName ?? "",
              prNumber: pr.number,
            });
            console.log("Queued diff fetch", { prId: createdPrId });
          }
        }
        break;
      }

      case "closed": {
        // Update PR state to closed or merged
        await db
          .update(pullRequests)
          .set({
            state: payload.pull_request.merged ? "merged" : "closed",
            githubMergedAt: pr.mergedAt,
            githubClosedAt: pr.closedAt,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(pullRequests.repositoryId, repo.id),
              eq(pullRequests.githubPrId, pr.id)
            )
          );

        console.log("Closed PR", { prNumber: pr.number, merged: payload.pull_request.merged });
        break;
      }

      default:
        console.log("Unhandled PR action", { action: data.action });
    }

    return NextResponse.json({ success: true, action: data.action });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
