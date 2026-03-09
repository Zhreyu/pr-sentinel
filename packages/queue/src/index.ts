import { Queue, Worker, Job } from "bullmq";

// Job types
export interface PRAnalysisJob {
  pullRequestId: string;
  repositoryId: string;
  headSha: string;
  priority: "high" | "normal" | "low";
  installationId?: number;
  owner?: string;
  repo?: string;
  prNumber?: number;
}

export interface DiffFetchJob {
  pullRequestId: string;
  installationId: number;
  owner: string;
  repo: string;
  prNumber: number;
}

// Get Redis connection config
function getRedisConfig() {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL is required");
  }
  // Parse Redis URL for BullMQ connection options
  const parsedUrl = new URL(url);
  return {
    host: parsedUrl.hostname,
    port: parseInt(parsedUrl.port || "6379", 10),
    password: parsedUrl.password || undefined,
    maxRetriesPerRequest: null,
  };
}

// Queue names
export const QUEUE_NAMES = {
  PR_ANALYSIS: "pr-analysis",
  DIFF_FETCH: "diff-fetch",
  WEBHOOK_PROCESS: "webhook-process",
} as const;

// Create queues
export function createPRAnalysisQueue() {
  return new Queue<PRAnalysisJob>(QUEUE_NAMES.PR_ANALYSIS, {
    connection: getRedisConfig(),
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
    },
  });
}

export function createDiffFetchQueue() {
  return new Queue<DiffFetchJob>(QUEUE_NAMES.DIFF_FETCH, {
    connection: getRedisConfig(),
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
    },
  });
}

// Create workers
export function createPRAnalysisWorker(
  processor: (job: Job<PRAnalysisJob>) => Promise<void>
) {
  return new Worker<PRAnalysisJob>(QUEUE_NAMES.PR_ANALYSIS, processor, {
    connection: getRedisConfig(),
    concurrency: 5,
    limiter: {
      max: 100,
      duration: 60000, // 100 jobs per minute
    },
  });
}

export function createDiffFetchWorker(
  processor: (job: Job<DiffFetchJob>) => Promise<void>
) {
  return new Worker<DiffFetchJob>(QUEUE_NAMES.DIFF_FETCH, processor, {
    connection: getRedisConfig(),
    concurrency: 10,
    limiter: {
      max: 500,
      duration: 60000, // 500 jobs per minute
    },
  });
}

// Singleton queues for enqueuing from web app
let prAnalysisQueue: Queue<PRAnalysisJob> | null = null;
let diffFetchQueue: Queue<DiffFetchJob> | null = null;

function getPRAnalysisQueue() {
  if (!prAnalysisQueue) {
    prAnalysisQueue = createPRAnalysisQueue();
  }
  return prAnalysisQueue;
}

function getDiffFetchQueue() {
  if (!diffFetchQueue) {
    diffFetchQueue = createDiffFetchQueue();
  }
  return diffFetchQueue;
}

/**
 * Enqueue a diff fetch job
 */
export async function enqueueDiffFetch(data: DiffFetchJob): Promise<void> {
  const queue = getDiffFetchQueue();
  await queue.add(`diff-${data.pullRequestId}`, data, {
    jobId: `diff-${data.pullRequestId}-${Date.now()}`,
  });
}

/**
 * Enqueue a PR analysis job
 */
export async function enqueuePRAnalysis(data: PRAnalysisJob): Promise<void> {
  const queue = getPRAnalysisQueue();
  const priority = data.priority === "high" ? 1 : data.priority === "low" ? 10 : 5;
  await queue.add(`analysis-${data.pullRequestId}`, data, {
    jobId: `analysis-${data.pullRequestId}-${Date.now()}`,
    priority,
  });
}

// Re-export BullMQ types
export { Queue, Worker, Job } from "bullmq";
