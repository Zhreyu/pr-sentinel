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
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  const webhookSecret = process.env.GITHUB_APP_WEBHOOK_SECRET;

  if (!appId || !privateKey || !webhookSecret) {
    throw new Error("Missing GitHub App configuration");
  }

  appInstance = new App({
    appId,
    privateKey: privateKey.replace(/\\n/g, "\n"), // Handle escaped newlines
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
