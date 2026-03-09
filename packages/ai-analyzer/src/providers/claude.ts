import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider } from "../types";

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

  async generate(prompt: string): Promise<string> {
    const message = await this.client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const content = message.content[0];
    if (!content || content.type !== "text") {
      throw new Error("Unexpected response type from Claude");
    }

    return content.text;
  }
}
