import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AIProvider, AnalysisResult, PRContext } from "../types";
import { analysisResultSchema } from "../types";
import { buildAnalysisPrompt, extractJSON } from "../prompt";

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

  async analyze(diff: string, context: PRContext): Promise<AnalysisResult> {
    const prompt = buildAnalysisPrompt(diff, context);

    const model = this.client.getGenerativeModel({ model: "gemini-1.5-pro" });
    const response = await model.generateContent(prompt);
    const content = response.response.text();

    if (!content) {
      throw new Error("No response from Gemini");
    }

    const jsonStr = extractJSON(content);
    const result = JSON.parse(jsonStr);
    return analysisResultSchema.parse(result);
  }
}
