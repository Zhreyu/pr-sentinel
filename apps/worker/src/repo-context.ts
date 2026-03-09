import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateRepositoryContextMarkdown } from "@pr-sentinel/ai-analyzer";
import { getRepositoryFileContent, listRepositoryContents } from "@pr-sentinel/github";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "../../../data/repo-contexts");
const MAX_CONTEXT_AGE_MS = 1000 * 60 * 60 * 24;
const ROOT_FILE_CANDIDATES = [
  "README.md",
  "package.json",
  "pnpm-workspace.yaml",
  "turbo.json",
  "tsconfig.json",
  "pyproject.toml",
  "Cargo.toml",
  "go.mod",
  "docker-compose.yml",
  "docker-compose.yaml",
];
const IMPORTANT_DIRECTORIES = [
  "src",
  "app",
  "server",
  "api",
  "lib",
  "packages",
  "services",
  "backend",
  "frontend",
  "workers",
];
const IMPORTANT_FILE_PATTERNS = [
  /^index\./,
  /^main\./,
  /^app\./,
  /^server\./,
  /^route\./,
  /^layout\./,
  /^schema\./,
  /^config\./,
];

export async function getOrCreateRepositoryContext(input: {
  installationId: number;
  owner: string;
  repo: string;
  defaultBranch: string;
  refresh?: boolean;
}): Promise<string> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const filePath = getContextFilePath(input.owner, input.repo);

  if (!input.refresh) {
    const existing = await readFreshContextFile(filePath);
    if (existing) {
      return existing;
    }
  }

  const rootEntries = await listRepositoryContents(
    input.installationId,
    input.owner,
    input.repo,
    "",
    input.defaultBranch
  );

  const files = await collectRepositorySamples({
    installationId: input.installationId,
    owner: input.owner,
    repo: input.repo,
    ref: input.defaultBranch,
    rootEntries,
  });

  const markdown = await generateRepositoryContextMarkdown({
    repository: `${input.owner}/${input.repo}`,
    defaultBranch: input.defaultBranch,
    rootEntries: rootEntries.map((entry) => `${entry.type}:${entry.path}`),
    files,
  });

  const finalMarkdown = `<!-- repo-context generated: ${new Date().toISOString()} -->\n\n${markdown.trim()}\n`;
  await fs.writeFile(filePath, finalMarkdown, "utf8");
  return finalMarkdown;
}

function getContextFilePath(owner: string, repo: string): string {
  const safeName = `${owner}__${repo}`.replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(DATA_DIR, `${safeName}.md`);
}

async function readFreshContextFile(filePath: string): Promise<string | null> {
  try {
    const stat = await fs.stat(filePath);
    if (Date.now() - stat.mtimeMs > MAX_CONTEXT_AGE_MS) {
      return null;
    }

    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

async function collectRepositorySamples(input: {
  installationId: number;
  owner: string;
  repo: string;
  ref: string;
  rootEntries: Array<{ path: string; name: string; type: "file" | "dir" | "symlink" | "submodule" }>;
}): Promise<Array<{ path: string; content: string }>> {
  const selectedPaths = new Set<string>();

  for (const candidate of ROOT_FILE_CANDIDATES) {
    selectedPaths.add(candidate);
  }

  for (const entry of input.rootEntries) {
    if (entry.type === "dir" && IMPORTANT_DIRECTORIES.includes(entry.name)) {
      const directoryEntries = await safeListDirectory(
        input.installationId,
        input.owner,
        input.repo,
        entry.path,
        input.ref
      );

      for (const child of directoryEntries) {
        if (
          child.type === "file" &&
          IMPORTANT_FILE_PATTERNS.some((pattern) => pattern.test(child.name))
        ) {
          selectedPaths.add(child.path);
        }
      }
    }
  }

  const selected = Array.from(selectedPaths).slice(0, 14);
  const files: Array<{ path: string; content: string }> = [];

  for (const filePath of selected) {
    const content = await safeReadFile(
      input.installationId,
      input.owner,
      input.repo,
      filePath,
      input.ref
    );

    if (content) {
      files.push({
        path: filePath,
        content: truncateContent(content, 7000),
      });
    }
  }

  return files;
}

async function safeListDirectory(
  installationId: number,
  owner: string,
  repo: string,
  dirPath: string,
  ref: string
): Promise<Array<{ path: string; name: string; type: "file" | "dir" | "symlink" | "submodule" }>> {
  try {
    return await listRepositoryContents(installationId, owner, repo, dirPath, ref);
  } catch {
    return [];
  }
}

async function safeReadFile(
  installationId: number,
  owner: string,
  repo: string,
  filePath: string,
  ref: string
): Promise<string | null> {
  try {
    return await getRepositoryFileContent(installationId, owner, repo, filePath, ref);
  } catch {
    return null;
  }
}

function truncateContent(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}\n\n[... repository context source truncated ...]`;
}
