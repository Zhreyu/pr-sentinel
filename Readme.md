# PR Sentinel

AI-powered PR triage platform for open source maintainers. This is a work in progress 




##  Quick Start

## Install dependencies
```bash
pnpm install
```

## Start dev databases
```bash
pnpm docker:dev
```

## Copy and configure environment
```bash
cp .env.example .env
```

## Build and run with Docker
```bash
pnpm docker:prod
```

The app needs GitHub OAuth credentials, a GitHub App, and at least one AI API key to function.