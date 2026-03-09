import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AIProvider } from "../types";

export class GeminiProvider implements AIProvider {
  name = "gemini";
  private client: GoogleGenerativeAI;

  constructor() {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_AI_API_KEY is required for Gemini provider");
    }
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async generate(prompt: string): Promise<string> {
    const model = this.client.getGenerativeModel({ model: "gemini-1.5-pro" });
    const response = await model.generateContent(prompt);
    const content = response.response.text();

    if (!content) {
      throw new Error("No response from Gemini");
    }

    return content;
  }
}
