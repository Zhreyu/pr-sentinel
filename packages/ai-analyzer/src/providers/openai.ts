import OpenAI from "openai";
import type { AIProvider } from "../types";

export class OpenAIProvider implements AIProvider {
  name = "openai";
  private client: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is required for OpenAI provider");
    }
    this.client = new OpenAI({ apiKey });
  }

  async generate(prompt: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from OpenAI");
    }

    return content;
  }
}
