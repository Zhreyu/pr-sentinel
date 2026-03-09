# PR Sentinel

PR Sentinel is an AI-powered pull request triage platform for open source maintainers and engineering teams. It ingests GitHub pull requests, fetches diffs, runs structured analysis with an LLM, and surfaces the highest-value or highest-risk changes first.

## Features

- GitHub App based PR ingestion
- GitHub OAuth based user sign-in
- AI scoring for PR value and risk
- AI slop detection signals
- Repository and workspace management
- Docker-first runtime for repeatable installs

## How It Works

1. GitHub sends webhook events to PR Sentinel.
2. PR metadata is stored in PostgreSQL.
3. A worker fetches the full diff and changed files.
4. The diff is analyzed with Claude, OpenAI, or Gemini.
5. Structured results are stored and shown in the dashboard.

## Architecture

The product runs as four services:

- `web`: Next.js app, auth routes, webhook ingestion, dashboard UI
- `worker`: background processing for diff fetch and AI analysis
- `db`: PostgreSQL for app data
- `redis`: queue backend for async jobs

## Prerequisites

You need the following before first install:

- Docker
- Node.js 20+
- pnpm
- one AI provider API key either gemini , anthropic or gpt
- a public HTTPS URL that GitHub can reach and forward to PR Sentinel on port `3000`

Examples of valid public URLs:

- `https://abc123.ngrok-free.app`
- `https://your-cloudflare-tunnel.trycloudflare.com`
- `https://pr-sentinel.example.com`

## Quick Start

Clone the repository and install dependencies:

```bash
git clone https://github.com/your-org/pr-sentinel.git
cd pr-sentinel
pnpm install
```

Run the first-time bootstrap:

```bash
pnpm bootstrap
```

The bootstrap flow will:

- ask for the public HTTPS URL GitHub can reach
- ask for one AI provider key
- optionally ask for a workspace name
- create or update `.env`
- start PostgreSQL and Redis in Docker
- run database migrations
- open GitHub to create the PR Sentinel GitHub App
- open GitHub to install the app
- open GitHub OAuth to complete the first workspace login

If you leave the workspace name blank, PR Sentinel will use a default based on your GitHub login.

## Runtime Commands

After bootstrap is complete, manage the full stack with:

```bash
pnpm start
pnpm stop
pnpm restart
pnpm logs
pnpm status
```

What each command does:

- `pnpm start`: build and start the full Docker stack
- `pnpm stop`: stop the Docker stack
- `pnpm restart`: recreate and restart the Docker stack
- `pnpm logs`: tail container logs
- `pnpm status`: show current container status

## Configuration

Bootstrap creates a local `.env` file for runtime secrets and generated values.

To inspect the environment template manually:

```bash
cp .env.example .env
```

Important notes:

- `.env` should never be committed
- GitHub App credentials are stored in `.env`
- a standalone `.pem` file is not required for normal setup

## GitHub Setup Notes

During bootstrap, PR Sentinel creates a GitHub App through the manifest flow and then uses the generated client credentials for GitHub OAuth.

The public URL you provide must be reachable by GitHub for:

- `/api/github/webhook`
- `/api/auth/github/callback`

If you are running locally, use a tunnel or domain that forwards traffic to `localhost:3000`.

## AI Analysis

For each pull request, PR Sentinel currently analyzes:

- cached repository context markdown generated from important repo files
- repository name
- PR title and description
- author
- base branch
- files changed count
- additions and deletions
- full diff content, truncated for safety on very large PRs
- targeted extra repo files when the analyzer decides more context is needed

The analysis result includes:

- intent classification
- value score
- risk score
- maintainer summary
- confidence
- top files to inspect
- AI slop indicators
- review suggestions

## Troubleshooting

### GitHub cannot reach the app

Make sure your public URL:

- is HTTPS
- is reachable from outside your machine
- forwards to port `3000`

### Bootstrap fails during migrations

Make sure Docker is running and retry:

```bash
pnpm bootstrap
```

### Sign-in does not work

Make sure bootstrap completed successfully and the GitHub App credentials were written to `.env`.

### Need to inspect the database

You can open Drizzle Studio with:

```bash
pnpm --filter=@pr-sentinel/database db:studio
```

## Security

- Do not commit `.env`
- Do not commit GitHub private keys or `.pem` files
- Rotate secrets if a credential has already been exposed locally or in git history

## Status

PR Sentinel is actively evolving. The current install path is terminal-first and Docker-first.
