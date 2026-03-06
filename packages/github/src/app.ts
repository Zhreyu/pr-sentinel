import { App } from "@octokit/app";

let appInstance: App | null = null;

// Type for the Octokit instance returned by the App
type InstallationOctokit = Awaited<ReturnType<App["getInstallationOctokit"]>>;

/**
 * Get or create the GitHub App instance
 */
export function getGitHubApp(): App {
  if (appInstance) {
    return appInstance;
  }

  const appId = process.env.GITHUB_APP_ID;
  let privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  const webhookSecret = process.env.GITHUB_APP_WEBHOOK_SECRET;

  if (!appId || !privateKey || !webhookSecret) {
    throw new Error("Missing GitHub App configuration");
  }

  console.log("[GitHub App] Original key length:", privateKey.length);
  console.log("[GitHub App] Has newlines:", privateKey.includes("\n"));
  console.log("[GitHub App] First 50 chars:", privateKey.substring(0, 50));

  // Handle various private key formats
  // 1. Escaped newlines from env vars: \n -> actual newlines
  privateKey = privateKey.replace(/\\n/g, "\n");

  // 2. If key doesn't start with proper header, it might be base64 encoded
  if (!privateKey.includes("-----BEGIN")) {
    try {
      privateKey = Buffer.from(privateKey, "base64").toString("utf-8");
    } catch {
      // Not base64, use as-is
    }
  }

  // 3. If key is on single line (no newlines in body), reformat it
  // PEM requires 64-character lines in the base64 body
  if (privateKey.includes("-----BEGIN") && !privateKey.includes("\n")) {
    console.log("[GitHub App] Reformatting single-line PEM key...");
    const match = privateKey.match(
      /(-----BEGIN [A-Z ]+-----)([A-Za-z0-9+/=]+)(-----END [A-Z ]+-----)/
    );
    if (match) {
      const [, header, body, footer] = match;
      if (header && body && footer) {
        // Split body into 64-character chunks
        const formattedBody = body.match(/.{1,64}/g)?.join("\n") ?? body;
        privateKey = `${header}\n${formattedBody}\n${footer}`;
        console.log("[GitHub App] Reformatted key, new length:", privateKey.length);
        console.log("[GitHub App] Key starts with:", privateKey.substring(0, 100));
      }
    } else {
      console.log("[GitHub App] Regex did not match the key format");
    }
  }

  appInstance = new App({
    appId,
    privateKey,
    webhooks: {
      secret: webhookSecret,
    },
  });

  return appInstance;
}

/**
 * Get an authenticated Octokit instance for a specific installation
 */
export async function getInstallationOctokit(
  installationId: number
): Promise<InstallationOctokit> {
  const app = getGitHubApp();
  return app.getInstallationOctokit(installationId);
}

/**
 * List all installations for this GitHub App
 */
export async function listInstallations(): Promise<unknown> {
  const app = getGitHubApp();
  const octokit = await app.getInstallationOctokit(0);
  return octokit.request("GET /app/installations");
}

/**
 * Get installation information by ID
 */
export async function getInstallation(installationId: number): Promise<unknown> {
  const octokit = await getInstallationOctokit(installationId);
  return octokit.request("GET /app/installations/{installation_id}", {
    installation_id: installationId,
  });
}

/**
 * List repositories accessible to an installation
 */
export async function listInstallationRepos(installationId: number): Promise<unknown> {
  const octokit = await getInstallationOctokit(installationId);
  return octokit.request("GET /installation/repositories", {
    per_page: 100,
  });
}

/**
 * Fetch the diff for a pull request
 */
export async function getPullRequestDiff(
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number
): Promise<string> {
  const octokit = await getInstallationOctokit(installationId);
  const response = await octokit.request(
    "GET /repos/{owner}/{repo}/pulls/{pull_number}",
    {
      owner,
      repo,
      pull_number: prNumber,
      headers: {
        accept: "application/vnd.github.v3.diff",
      },
    }
  );
  return response.data as unknown as string;
}

/**
 * List open pull requests for a repository
 */
// Basic PR info from list endpoint (doesn't include additions/deletions/changed_files)
export interface PullRequestListItem {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  draft: boolean;
  user: { id: number; login: string } | null;
  head: { sha: string; ref: string };
  base: { sha: string; ref: string };
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  closed_at: string | null;
}

// Full PR info from single PR endpoint (includes additions/deletions/changed_files)
export interface PullRequestFull extends PullRequestListItem {
  additions: number;
  deletions: number;
  changed_files: number;
}

export async function listOpenPullRequests(
  installationId: number,
  owner: string,
  repo: string
): Promise<PullRequestListItem[]> {
  const octokit = await getInstallationOctokit(installationId);
  const response = await octokit.request(
    "GET /repos/{owner}/{repo}/pulls",
    {
      owner,
      repo,
      state: "open",
      per_page: 100,
    }
  );
  return response.data as unknown as PullRequestListItem[];
}

/**
 * Get a single pull request with full details
 */
export async function getPullRequest(
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number
): Promise<PullRequestFull> {
  const octokit = await getInstallationOctokit(installationId);
  const response = await octokit.request(
    "GET /repos/{owner}/{repo}/pulls/{pull_number}",
    {
      owner,
      repo,
      pull_number: prNumber,
    }
  );
  return response.data as unknown as PullRequestFull;
}

/**
 * Fetch files changed in a pull request
 */
export async function getPullRequestFiles(
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number
): Promise<Array<{
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}>> {
  const octokit = await getInstallationOctokit(installationId);
  const response = await octokit.request(
    "GET /repos/{owner}/{repo}/pulls/{pull_number}/files",
    {
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
    }
  );
  return response.data as Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    patch?: string;
  }>;
}
