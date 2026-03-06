import { Webhooks } from "@octokit/webhooks";
import type { PullRequestEvent, PullRequestReviewEvent } from "@octokit/webhooks-types";

export type PRWebhookPayload = PullRequestEvent;
export type PRReviewWebhookPayload = PullRequestReviewEvent;

/**
 * Create a webhooks handler with the configured secret
 */
export function createWebhooksHandler(): Webhooks {
  const secret = process.env.GITHUB_APP_WEBHOOK_SECRET;

  if (!secret) {
    throw new Error("Missing GITHUB_APP_WEBHOOK_SECRET");
  }

  return new Webhooks({ secret });
}

/**
 * Verify webhook signature
 */
export async function verifyWebhookSignature(
  payload: string,
  signature: string
): Promise<boolean> {
  const webhooks = createWebhooksHandler();
  try {
    await webhooks.verify(payload, signature);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract PR data from webhook payload
 */
export function extractPRData(payload: PRWebhookPayload) {
  const { pull_request: pr, repository, installation, action } = payload;

  return {
    action,
    installationId: installation?.id,
    repository: {
      id: repository.id,
      fullName: repository.full_name,
      defaultBranch: repository.default_branch,
    },
    pullRequest: {
      id: pr.id,
      number: pr.number,
      title: pr.title,
      body: pr.body,
      state: pr.state,
      draft: pr.draft,
      authorId: pr.user.id,
      authorLogin: pr.user.login,
      headSha: pr.head.sha,
      baseSha: pr.base.sha,
      headRef: pr.head.ref,
      baseRef: pr.base.ref,
      additions: pr.additions,
      deletions: pr.deletions,
      changedFiles: pr.changed_files,
      createdAt: new Date(pr.created_at).getTime() / 1000,
      updatedAt: new Date(pr.updated_at).getTime() / 1000,
      mergedAt: pr.merged_at ? new Date(pr.merged_at).getTime() / 1000 : null,
      closedAt: pr.closed_at ? new Date(pr.closed_at).getTime() / 1000 : null,
    },
  };
}
