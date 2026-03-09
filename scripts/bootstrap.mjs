import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const ENV_PATH = path.join(ROOT_DIR, ".env");
const COMPOSE_FILE = path.join(ROOT_DIR, "docker", "docker-compose.prod.yml");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function main() {
  try {
    assertCommandAvailable("docker");
    assertCommandAvailable("pnpm");
    assertBrowserCommandAvailable();

    const existingEnv = readEnvFile(ENV_PATH);
    const config = await collectBootstrapConfig(existingEnv);

    writeEnvFile(ENV_PATH, existingEnv, {
      DATABASE_URL: config.databaseUrl,
      REDIS_URL: config.redisUrl,
      NEXT_PUBLIC_APP_URL: config.appUrl,
      SESSION_SECRET: existingEnv.SESSION_SECRET || generateSessionSecret(),
      DEFAULT_WORKSPACE_NAME: config.workspaceName,
      ANTHROPIC_API_KEY: config.provider === "anthropic" ? config.apiKey : null,
      OPENAI_API_KEY: config.provider === "openai" ? config.apiKey : null,
      GOOGLE_AI_API_KEY: config.provider === "google" ? config.apiKey : null,
    });

    logStep("Starting PostgreSQL and Redis");
    await runCommand(
      "docker",
      ["compose", "-f", COMPOSE_FILE, "up", "-d", "db", "redis"],
      ROOT_DIR
    );

    logStep("Running database migrations");
    await runCommandWithRetry(
      "pnpm",
      ["--filter", "@pr-sentinel/database", "db:migrate"],
      ROOT_DIR,
      10,
      3000
    );

    const manifestServer = await startManifestSetupServer(config.appUrl);
    const manifestUrl = manifestServer.startUrl;

    logStep("Opening GitHub App creation flow");
    await openBrowser(manifestUrl);
    console.log("Complete the GitHub App creation flow in your browser.");

    const manifestData = await manifestServer.waitForCode();
    await manifestServer.close();

    logStep("Saving GitHub App credentials");
    const convertedManifest = await exchangeManifestCode(manifestData.code);
    writeEnvFile(ENV_PATH, readEnvFile(ENV_PATH), {
      GITHUB_APP_ID: String(convertedManifest.id),
      GITHUB_APP_SLUG: convertedManifest.slug,
      NEXT_PUBLIC_GITHUB_APP_SLUG: convertedManifest.slug,
      GITHUB_APP_CLIENT_ID: convertedManifest.client_id,
      GITHUB_APP_CLIENT_SECRET: convertedManifest.client_secret,
      GITHUB_APP_PRIVATE_KEY: convertedManifest.pem.replace(/\n/g, "\\n"),
      GITHUB_APP_WEBHOOK_SECRET:
        convertedManifest.webhook_secret || generateWebhookSecret(),
      GITHUB_OAUTH_CLIENT_ID: convertedManifest.client_id,
      GITHUB_OAUTH_CLIENT_SECRET: convertedManifest.client_secret,
    });

    logStep("Reloading services with GitHub credentials");
    await runCommand(
      "docker",
      [
        "compose",
        "-f",
        COMPOSE_FILE,
        "up",
        "-d",
        "--build",
        "--force-recreate",
        "web",
        "worker",
      ],
      ROOT_DIR
    );
    await waitForHttp("http://127.0.0.1:3000/", 20, 3000);

    const installUrl = `https://github.com/apps/${convertedManifest.slug}/installations/new`;
    logStep("Opening GitHub App installation page");
    await openBrowser(installUrl);
    await rl.question("Press Enter after you finish installing the GitHub App...");

    const authUrl = `${trimTrailingSlash(config.appUrl)}/api/auth/github?setup=true`;
    logStep("Opening GitHub sign-in");
    await openBrowser(authUrl);
    await rl.question(
      "Press Enter after GitHub sign-in completes and the dashboard opens..."
    );

    logStep("Bootstrap complete");
    console.log("Use `pnpm start`, `pnpm stop`, and `pnpm logs` for normal lifecycle management.");
  } finally {
    rl.close();
  }
}

async function collectBootstrapConfig(existingEnv) {
  console.log("PR Sentinel bootstrap");
  console.log("---------------------");

  const appUrl = await askWithDefault(
    "Public HTTPS URL GitHub can reach (example: https://abc123.ngrok-free.app)",
    existingEnv.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  );

  const databaseUrl =
    existingEnv.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/pr_sentinel";
  const redisUrl = existingEnv.REDIS_URL || "redis://localhost:6379";

  const providerInput = await askWithDefault(
    "AI provider (anthropic/openai/google)",
    inferProvider(existingEnv)
  );
  const provider = normalizeProvider(providerInput);
  if (!provider) {
    throw new Error("Invalid AI provider. Use anthropic, openai, or google.");
  }

  const existingApiKey =
    provider === "anthropic"
      ? existingEnv.ANTHROPIC_API_KEY
      : provider === "openai"
        ? existingEnv.OPENAI_API_KEY
        : existingEnv.GOOGLE_AI_API_KEY;
  const apiKey = await askWithDefault(`${provider} API key`, existingApiKey || "");
  if (!apiKey) {
    throw new Error("An AI provider API key is required.");
  }

  const workspaceName = await askWithDefault(
    "Workspace name (leave blank for automatic default)",
    existingEnv.DEFAULT_WORKSPACE_NAME || ""
  );

  return {
    appUrl,
    databaseUrl,
    redisUrl,
    provider,
    apiKey,
    workspaceName,
  };
}

async function askWithDefault(label, defaultValue) {
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  const answer = await rl.question(`${label}${suffix}: `);
  return answer.trim() || defaultValue;
}

function inferProvider(existingEnv) {
  if (existingEnv.ANTHROPIC_API_KEY) return "anthropic";
  if (existingEnv.OPENAI_API_KEY) return "openai";
  if (existingEnv.GOOGLE_AI_API_KEY) return "google";
  return "anthropic";
}

function normalizeProvider(value) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "anthropic" || normalized === "openai" || normalized === "google") {
    return normalized;
  }
  return null;
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const content = fs.readFileSync(filePath, "utf8");
  const result = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1);
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replace(/\\"/g, '"');
    }
    result[key] = value;
  }

  return result;
}

function writeEnvFile(filePath, existingEnv, updates) {
  const merged = { ...existingEnv };
  for (const [key, value] of Object.entries(updates)) {
    if (value === null) {
      delete merged[key];
    } else {
      merged[key] = value;
    }
  }

  const orderedKeys = [
    "DATABASE_URL",
    "REDIS_URL",
    "NEXT_PUBLIC_APP_URL",
    "SESSION_SECRET",
    "DEFAULT_WORKSPACE_NAME",
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "GOOGLE_AI_API_KEY",
    "GITHUB_APP_ID",
    "GITHUB_APP_SLUG",
    "NEXT_PUBLIC_GITHUB_APP_SLUG",
    "GITHUB_APP_CLIENT_ID",
    "GITHUB_APP_CLIENT_SECRET",
    "GITHUB_APP_PRIVATE_KEY",
    "GITHUB_APP_WEBHOOK_SECRET",
    "GITHUB_OAUTH_CLIENT_ID",
    "GITHUB_OAUTH_CLIENT_SECRET",
    "NODE_ENV",
  ];

  if (!merged.NODE_ENV) {
    merged.NODE_ENV = "production";
  }

  const remainingKeys = Object.keys(merged).filter((key) => !orderedKeys.includes(key)).sort();
  const finalKeys = [...orderedKeys.filter((key) => key in merged), ...remainingKeys];
  const lines = finalKeys.map((key) => `${key}=${formatEnvValue(merged[key])}`);

  fs.writeFileSync(filePath, `${lines.join(os.EOL)}${os.EOL}`, "utf8");
}

function formatEnvValue(value) {
  if (value === undefined) {
    return "";
  }
  if (value.includes("\n") || value.includes(" ") || value.includes('"')) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return value;
}

function generateSessionSecret() {
  return crypto.randomBytes(32).toString("hex");
}

function generateWebhookSecret() {
  return crypto.randomBytes(24).toString("hex");
}

function assertCommandAvailable(command) {
  const result = spawnSync(command, ["--version"], {
    cwd: ROOT_DIR,
    stdio: "ignore"
  });
  if (result.error || result.status !== 0) {
    throw new Error(`Required command not found or unavailable: ${command}`);
  }
}

function assertBrowserCommandAvailable() {
  if (process.platform === "win32") {
    return;
  }

  const command = getBrowserCommand();
  const result = spawnSync(command, ["--version"], {
    cwd: ROOT_DIR,
    stdio: "ignore"
  });

  if (result.error || result.status !== 0) {
    throw new Error(`Required browser opener not found or unavailable: ${command}`);
  }
}

function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      env: process.env,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}`));
      }
    });
  });
}

async function runCommandWithRetry(command, args, cwd, attempts, delayMs) {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await runCommand(command, args, cwd);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        console.log(`Retrying in ${delayMs}ms (${attempt}/${attempts})...`);
        await sleep(delayMs);
      }
    }
  }

  throw lastError;
}

function startManifestSetupServer(appUrl) {
  let resolveCode;
  let rejectCode;
  const codePromise = new Promise((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });

  let callbackUrl = "";
  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
    if (requestUrl.pathname === "/github-app/start") {
      const manifest = buildGitHubManifest(appUrl, callbackUrl);
      const manifestJson = JSON.stringify(manifest);

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!DOCTYPE html>
<html>
  <body style="font-family: sans-serif; padding: 32px;">
    <h2>PR Sentinel setup</h2>
    <p>Redirecting to GitHub to create the PR Sentinel App...</p>
    <form id="manifest-form" method="POST" action="https://github.com/settings/apps/new">
      <input type="hidden" name="manifest" value=${JSON.stringify(manifestJson)} />
    </form>
    <script>document.getElementById('manifest-form').submit();</script>
  </body>
</html>`);
      return;
    }

    const code = requestUrl.searchParams.get("code");

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!DOCTYPE html>
<html>
  <body style="font-family: sans-serif; padding: 32px;">
    <h2>PR Sentinel setup</h2>
    <p>You can return to the terminal. GitHub App creation has been captured.</p>
  </body>
</html>`);

    if (code) {
      resolveCode({ code });
    } else {
      rejectCode(new Error("GitHub App setup callback did not include a code."));
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to start local callback server."));
        return;
      }

      callbackUrl = `http://127.0.0.1:${address.port}/github-app/callback`;
      resolve({
        callbackUrl,
        startUrl: `http://127.0.0.1:${address.port}/github-app/start`,
        waitForCode: () => codePromise,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
              } else {
                closeResolve();
              }
            });
          }),
      });
    });
  });
}

function buildGitHubManifest(appUrl, redirectUrl) {
  const normalizedAppUrl = trimTrailingSlash(appUrl);

  return {
    name: "PR Sentinel",
    url: normalizedAppUrl,
    description: "AI-powered pull request analysis and triage",
    hook_attributes: {
      url: `${normalizedAppUrl}/api/github/webhook`,
      active: true,
    },
    redirect_url: redirectUrl,
    callback_urls: [`${normalizedAppUrl}/api/auth/github/callback`],
    setup_on_update: true,
    public: false,
    default_permissions: {
      pull_requests: "write",
      contents: "read",
      metadata: "read",
      members: "read",
    },
    default_events: ["pull_request", "installation", "installation_repositories"],
  };
}

async function exchangeManifestCode(code) {
  const response = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "pr-sentinel-bootstrap",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub App conversion failed: ${response.status} ${text}`);
  }

  return response.json();
}

function openBrowser(url) {
  const command = getBrowserCommand();
  if (process.platform === "win32") {
    return runCommand(command, ["/c", "start", "", url], ROOT_DIR);
  }
  return runCommand(command, [url], ROOT_DIR);
}

function getBrowserCommand() {
  if (process.platform === "darwin") {
    return "open";
  }
  if (process.platform === "win32") {
    return "cmd";
  }
  return "xdg-open";
}

function trimTrailingSlash(value) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function logStep(message) {
  console.log(`\n==> ${message}`);
}

async function waitForHttp(url, attempts, delayMs) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status >= 200 && response.status < 400) {
        return;
      }
    } catch {
      // keep retrying
    }

    if (attempt < attempts) {
      await sleep(delayMs);
    }
  }

  throw new Error(`Timed out waiting for ${url}`);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

main().catch((error) => {
  console.error(`\nBootstrap failed: ${error.message}`);
  process.exitCode = 1;
});
