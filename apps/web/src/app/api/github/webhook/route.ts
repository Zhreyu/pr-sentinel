import { NextRequest, NextResponse } from "next/server";
import {
  verifyWebhookSignature,
  extractPRData,
  listOpenPullRequests,
  getPullRequest,
  type PRWebhookPayload,
} from "@pr-sentinel/github";
import { db } from "@pr-sentinel/database";
import { repositories, pullRequests, organizations } from "@pr-sentinel/database/schema";
import { eq, and } from "drizzle-orm";
import { enqueueDiffFetch } from "@pr-sentinel/queue";

interface InstallationPayload {
  action: "created" | "deleted" | "suspend" | "unsuspend" | "new_permissions_accepted";
  installation: {
    id: number;
    account: {
      id: number;
      login: string;
      type: string;
    };
  };
  repositories?: Array<{
    id: number;
    name: string;
    full_name: string;
    private: boolean;
  }>;
}

interface InstallationReposPayload {
  action: "added" | "removed";
  installation: {
    id: number;
    account: {
      id: number;
      login: string;
    };
  };
  repositories_added?: Array<{
    id: number;
    name: string;
    full_name: string;
    private: boolean;
  }>;
  repositories_removed?: Array<{
    id: number;
    name: string;
    full_name: string;
  }>;
}

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

  try {
    // Handle installation events
    if (event === "installation") {
      const payload = JSON.parse(body) as InstallationPayload;
      return handleInstallation(payload);
    }

    // Handle installation_repositories events (repos added/removed)
    if (event === "installation_repositories") {
      const payload = JSON.parse(body) as InstallationReposPayload;
      return handleInstallationRepos(payload);
    }

    // Only handle pull_request events
    if (event !== "pull_request") {
      return NextResponse.json({ message: `Event ${event} ignored` });
    }

    const payload = JSON.parse(body) as PRWebhookPayload;
    return handlePullRequest(payload);
  } catch (error) {
    console.error("Webhook processing error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function handleInstallation(payload: InstallationPayload): Promise<NextResponse> {
  const { action, installation, repositories: repos } = payload;

  console.log("Installation event", { action, installationId: installation.id });

  if (action === "created") {
    // Create organization for this installation
    const orgName = installation.account.login;
    let org = await db
      .select()
      .from(organizations)
      .where(eq(organizations.githubInstallationId, installation.id))
      .limit(1)
      .then((rows) => rows[0]);

    if (!org) {
      const newOrg = await db
        .insert(organizations)
        .values({
          name: orgName,
          githubInstallationId: installation.id,
          githubOrgId: installation.account.id,
          githubOrgLogin: orgName,
        })
        .returning();
      org = newOrg[0];
    }

    if (!org) {
      return NextResponse.json({ error: "Failed to create organization" }, { status: 500 });
    }

    // Process each repository
    if (repos) {
      for (const repoData of repos) {
        await syncRepository(org.id, installation.id, repoData);
      }
    }

    return NextResponse.json({ success: true, action: "installation_created" });
  }

  if (action === "deleted") {
    // Mark all repos as inactive for this installation
    const org = await db
      .select()
      .from(organizations)
      .where(eq(organizations.githubInstallationId, installation.id))
      .limit(1)
      .then((rows) => rows[0]);

    if (org) {
      await db
        .update(repositories)
        .set({ isActive: false })
        .where(eq(repositories.organizationId, org.id));
    }

    return NextResponse.json({ success: true, action: "installation_deleted" });
  }

  return NextResponse.json({ success: true, action });
}

async function handleInstallationRepos(payload: InstallationReposPayload): Promise<NextResponse> {
  const { action, installation, repositories_added, repositories_removed } = payload;

  console.log("Installation repos event", { action, installationId: installation.id });

  // Get or create organization
  let org = await db
    .select()
    .from(organizations)
    .where(eq(organizations.githubInstallationId, installation.id))
    .limit(1)
    .then((rows) => rows[0]);

  if (!org) {
    const newOrg = await db
      .insert(organizations)
      .values({
        name: installation.account.login,
        githubInstallationId: installation.id,
        githubOrgId: installation.account.id,
        githubOrgLogin: installation.account.login,
      })
      .returning();
    org = newOrg[0];
  }

  if (!org) {
    return NextResponse.json({ error: "Failed to get organization" }, { status: 500 });
  }

  if (action === "added" && repositories_added) {
    for (const repoData of repositories_added) {
      await syncRepository(org.id, installation.id, repoData);
    }
  }

  if (action === "removed" && repositories_removed) {
    for (const repoData of repositories_removed) {
      await db
        .update(repositories)
        .set({ isActive: false })
        .where(
          and(
            eq(repositories.organizationId, org.id),
            eq(repositories.githubRepoId, repoData.id)
          )
        );
    }
  }

  return NextResponse.json({ success: true, action });
}

async function syncRepository(
  orgId: string,
  installationId: number,
  repoData: { id: number; name: string; full_name: string }
) {
  // Find or create repository
  let repo = await db
    .select()
    .from(repositories)
    .where(
      and(
        eq(repositories.organizationId, orgId),
        eq(repositories.githubRepoId, repoData.id)
      )
    )
    .limit(1)
    .then((rows) => rows[0]);

  if (!repo) {
    const newRepo = await db
      .insert(repositories)
      .values({
        organizationId: orgId,
        githubRepoId: repoData.id,
        githubFullName: repoData.full_name,
        isActive: true,
      })
      .returning();
    repo = newRepo[0];
  } else {
    // Reactivate if it was inactive
    await db
      .update(repositories)
      .set({ isActive: true })
      .where(eq(repositories.id, repo.id));
  }

  if (!repo) {
    console.error("Failed to create repository", { repoData });
    return;
  }

  // Sync existing open PRs
  const [owner, repoName] = repoData.full_name.split("/");
  if (!owner || !repoName) return;

  try {
    console.log("Fetching open PRs for", repoData.full_name);
    const openPRs = await listOpenPullRequests(installationId, owner, repoName);
    console.log(`Found ${openPRs.length} open PRs`);

    for (const pr of openPRs) {
      // Get full PR details (list endpoint doesn't include additions/deletions)
      const fullPR = await getPullRequest(installationId, owner, repoName, pr.number);

      // Check if PR already exists
      const existingPR = await db
        .select()
        .from(pullRequests)
        .where(
          and(
            eq(pullRequests.repositoryId, repo.id),
            eq(pullRequests.githubPrId, fullPR.id)
          )
        )
        .limit(1)
        .then((rows) => rows[0]);

      if (!existingPR) {
        // Create new PR
        const newPR = await db
          .insert(pullRequests)
          .values({
            repositoryId: repo.id,
            githubPrId: fullPR.id,
            githubPrNumber: fullPR.number,
            title: fullPR.title,
            body: fullPR.body,
            state: fullPR.state as "open" | "closed" | "merged",
            draft: fullPR.draft,
            authorGithubId: fullPR.user?.id ?? 0,
            authorLogin: fullPR.user?.login ?? "unknown",
            headSha: fullPR.head.sha,
            baseSha: fullPR.base.sha,
            headRef: fullPR.head.ref,
            baseRef: fullPR.base.ref,
            additions: fullPR.additions,
            deletions: fullPR.deletions,
            changedFiles: fullPR.changed_files,
            githubCreatedAt: Math.floor(new Date(fullPR.created_at).getTime() / 1000),
            githubUpdatedAt: Math.floor(new Date(fullPR.updated_at).getTime() / 1000),
          })
          .returning({ id: pullRequests.id });

        const createdPrId = newPR[0]?.id;
        console.log("Synced PR", { prNumber: fullPR.number, prId: createdPrId });

        // Queue diff fetch job
        if (createdPrId) {
          await enqueueDiffFetch({
            pullRequestId: createdPrId,
            installationId,
            owner,
            repo: repoName,
            prNumber: fullPR.number,
          });
        }
      }
    }
  } catch (error) {
    console.error("Error syncing PRs for", repoData.full_name, error);
  }
}

async function handlePullRequest(payload: PRWebhookPayload): Promise<NextResponse> {
  const data = extractPRData(payload);

  // Skip if no installation ID
  if (!data.installationId) {
    console.warn("No installation ID in webhook payload");
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
    const orgName = data.repository.fullName.split("/")[0] ?? "Unknown";
    const newOrg = await db
      .insert(organizations)
      .values({
        name: orgName,
        githubInstallationId: data.installationId,
        githubOrgId: data.repository.id,
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
}
