import type { AIProvider, AnalysisResult, PRContext } from "./types";
import { ClaudeProvider } from "./providers/claude";
import { OpenAIProvider } from "./providers/openai";
import { GeminiProvider } from "./providers/gemini";

export * from "./types";
export * from "./providers";
export * from "./prompt";
export * from "./pipeline";

/**
 * Get the configured AI provider based on environment
 * Priority: Claude > OpenAI > Gemini
 */
export function getAIProvider(): AIProvider {
  if (process.env.ANTHROPIC_API_KEY) {
    return new ClaudeProvider();
  }
  if (process.env.OPENAI_API_KEY) {
    return new OpenAIProvider();
  }
  if (process.env.GOOGLE_AI_API_KEY) {
    return new GeminiProvider();
  }
  throw new Error("No AI provider configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_AI_API_KEY");
}

/**
 * Analyze a PR using the configured provider
 */
export async function analyzePR(diff: string, context: PRContext): Promise<AnalysisResult> {
  const provider = getAIProvider();
  return provider.analyze(diff, context);
}

/**
 * Get the name of the currently configured provider
 */
export function getProviderName(): string {
  if (process.env.ANTHROPIC_API_KEY) return "claude";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.GOOGLE_AI_API_KEY) return "gemini";
  return "none";
}
