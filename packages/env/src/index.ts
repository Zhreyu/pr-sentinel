import { z } from "zod";

// Server-side environment variables
export const serverEnvSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url(),

  // GitHub OAuth (user provides their own)
  GITHUB_OAUTH_CLIENT_ID: z.string().min(1),
  GITHUB_OAUTH_CLIENT_SECRET: z.string().min(1),

  // GitHub App (user provides their own)
  GITHUB_APP_ID: z.string().min(1),
  GITHUB_APP_PRIVATE_KEY: z.string().min(1),
  GITHUB_APP_WEBHOOK_SECRET: z.string().min(1),

  // AI Providers (at least one required)
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_AI_API_KEY: z.string().optional(),

  // Session
  SESSION_SECRET: z.string().min(32),

  // App
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

// Client-side environment variables
export const clientEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

// Combined schema
export const envSchema = serverEnvSchema.merge(clientEnvSchema);

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type ClientEnv = z.infer<typeof clientEnvSchema>;
export type Env = z.infer<typeof envSchema>;

// Validate and export environment
export function validateEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment variables");
  }

  // Ensure at least one AI provider is configured
  const { ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_AI_API_KEY } = parsed.data;
  if (!ANTHROPIC_API_KEY && !OPENAI_API_KEY && !GOOGLE_AI_API_KEY) {
    throw new Error("At least one AI provider API key is required");
  }

  return parsed.data;
}

// Export individual getters for lazy loading
export function getServerEnv(): ServerEnv {
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error("Invalid server environment variables");
  }
  return parsed.data;
}

export function getClientEnv(): ClientEnv {
  const parsed = clientEnvSchema.safeParse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
  if (!parsed.success) {
    throw new Error("Invalid client environment variables");
  }
  return parsed.data;
}
