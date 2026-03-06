import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider, AnalysisResult, PRContext } from "../types";
import { analysisResultSchema } from "../types";
import { buildAnalysisPrompt, extractJSON } from "../prompt";

export class ClaudeProvider implements AIProvider {
  name = "claude";
  private client: Anthropic;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is required for Claude provider");
    }
    this.client = new Anthropic({ apiKey });
  }

  async analyze(diff: string, context: PRContext): Promise<AnalysisResult> {
    const prompt = buildAnalysisPrompt(diff, context);

    const message = await this.client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const content = message.content[0];
    if (!content || content.type !== "text") {
      throw new Error("Unexpected response type from Claude");
    }

    const jsonStr = extractJSON(content.text);
    const result = JSON.parse(jsonStr);
    return analysisResultSchema.parse(result);
  }
}
