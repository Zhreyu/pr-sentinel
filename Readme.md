# PR Sentinel

AI-powered PR triage platform for open source maintainers. This is a work in progress 



## Step-by-Step Setup

### 1. Prerequisites

You need to create credentials on GitHub:

**GitHub OAuth App (for user login):**
1. Go to: https://github.com/settings/developers
2. Click "New OAuth App"
3. Set Homepage URL: http://localhost:3000
4. Set Callback URL: http://localhost:3000/api/auth/github/callback
5. Copy Client ID and Client Secret

**GitHub App (for repo webhooks):**
1. Go to: https://github.com/settings/apps
2. Click "New GitHub App"
3. Set Homepage URL: http://localhost:3000
4. Set Webhook URL: http://localhost:3000/api/github/webhook (use ngrok for local dev)
5. Generate a Webhook Secret
6. Set permissions: Pull requests (Read & write)
7. Subscribe to events: Pull request
8. Generate and download the Private Key
9. Copy the App ID

### 2. Configure Environment

```bash
  cd /mnt/Z/Stuff/GitHub/pr-sentinel

  # Copy the example env
  cp .env.example .env

  Edit .env with your credentials:
  # Database (already running on port 5433)
  DATABASE_URL=postgresql://postgres:postgres@localhost:5433/pr_sentinel

  # Redis
  REDIS_URL=redis://localhost:6379

  # GitHub OAuth (from step 1)
  GITHUB_OAUTH_CLIENT_ID=your_client_id
  GITHUB_OAUTH_CLIENT_SECRET=your_client_secret

  # GitHub App (from step 1)
  GITHUB_APP_ID=123456
  GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
  GITHUB_APP_WEBHOOK_SECRET=your_webhook_secret

  # AI Provider (at least one - Claude recommended)
  ANTHROPIC_API_KEY=sk-ant-...

  # Session secret (generate: openssl rand -hex 32)
  SESSION_SECRET=your_random_secret_here

  # App URL
  NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Start the Services
```bash
  # Terminal 1: Start databases (already running from earlier)
  pnpm docker:dev

  # Terminal 2: Start the web app
  pnpm dev --filter=@pr-sentinel/web

  # Terminal 3: Start the worker (processes PR analysis)
  cd apps/worker && pnpm dev
```

### 4. Expose Webhook for Local Development

  GitHub needs to reach your local server. Use ngrok:
```bash
  # Install ngrok: https://ngrok.com/download
  ngrok http 3000
```

  Then update your GitHub App's webhook URL to: https://your-ngrok-url.ngrok.io/api/github/webhook

###  5. Install the GitHub App


  1. Go to your GitHub App settings
  2. Click "Install App"
  3. Select repositories to monitor
  4. PRs from those repos will now flow into PR Sentinel

### 6. Use the Dashboard

  1. Open http://localhost:3000
  2. Click "Login with GitHub"
  3. View the dashboard at /dashboard

  Dashboard Features:
  - Filter by: All, High Value, Medium, Low Signal, AI Slop, Pending
  - Sort by: Priority (value-risk), Updated, Created
  - Search: By title, author, or repo name

## How It Processes PRs

  1. PR Opened -> GitHub sends webhook to /api/github/webhook
  2. Stored -> PR details saved to PostgreSQL
  3. Queued -> Diff fetch job added to BullMQ
  4. Worker picks up -> Fetches diff from GitHub API
  5. AI Analysis -> Sends to Claude/OpenAI/Gemini for scoring
  6. Results stored -> Value score, risk score, AI slop indicators
  7. Dashboard shows -> PRs sorted by priority

## Quick Test

If you want to test without webhooks:
```
  # Insert a test PR directly (in psql or via Drizzle Studio)
  pnpm --filter=@pr-sentinel/database db:studio
```
Or trigger a webhook manually using the GitHub App's webhook test feature.


