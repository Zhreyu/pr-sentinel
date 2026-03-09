import { getAIProvider, getProviderName } from "./index";
import {
  analysisResultSchema,
  triageDecisionSchema,
  type ContextFileExcerpt,
  type PRContext,
  type TriageDecision,
} from "./types";
import {
  buildAnalysisPrompt,
  buildRepoContextPrompt,
  buildTriagePrompt,
  extractJSON,
} from "./prompt";

const PROMPT_VERSION = "2.0.0";
const MAX_DIFF_SIZE = 100_000; // 100KB max diff for analysis

export interface PipelineInput {
  diff: string;
  context: PRContext;
  repoContext?: string;
  triage?: TriageDecision;
  extraContextFiles?: ContextFileExcerpt[];
}

export interface PipelineResult {
  analysis: ReturnType<typeof analysisResultSchema.parse>;
  modelUsed: string;
  promptVersion: string;
  tokensUsed?: number;
  durationMs: number;
  truncated: boolean;
}

/**
 * Truncate diff to reasonable size for AI analysis
 */
function truncateDiff(diff: string, maxSize: number = MAX_DIFF_SIZE): { diff: string; truncated: boolean } {
  if (diff.length <= maxSize) {
    return { diff, truncated: false };
  }

  // Try to truncate at a line boundary
  const truncatedDiff = diff.slice(0, maxSize);
  const lastNewline = truncatedDiff.lastIndexOf("\n");
  const finalDiff = lastNewline > 0 ? truncatedDiff.slice(0, lastNewline) : truncatedDiff;

  return {
    diff: finalDiff + "\n\n[... diff truncated due to size ...]",
    truncated: true,
  };
}

/**
 * Run the triage step to determine if extra repo context is needed.
 */
export async function planAnalysisContext(input: PipelineInput): Promise<TriageDecision> {
  const { diff: processedDiff, truncated } = truncateDiff(input.diff);
  const provider = getAIProvider();
  const prompt = buildTriagePrompt(processedDiff, input.context, input.repoContext);
  const response = await provider.generate(prompt);
  const jsonStr = extractJSON(response);
  const triage = triageDecisionSchema.parse(JSON.parse(jsonStr));

  if (truncated && !triage.needsMoreContext) {
    return {
      ...triage,
      needsMoreContext: true,
      reasoning: `${triage.reasoning} Diff was truncated, so limited extra context is justified.`,
    };
  }

  return triage;
}

/**
 * Run the full analysis pipeline
 */
export async function runAnalysisPipeline(input: PipelineInput): Promise<PipelineResult> {
  const startTime = Date.now();
  const { diff: processedDiff, truncated } = truncateDiff(input.diff);
  const provider = getAIProvider();
  const triage = input.triage ?? {
    needsMoreContext: false,
    reasoning: "No explicit triage step was provided.",
    contextNotes: [],
    topFilesToInspect: [],
    contextFilesToRead: [],
  };
  const prompt = buildAnalysisPrompt(
    processedDiff,
    input.context,
    triage,
    input.repoContext,
    input.extraContextFiles ?? []
  );
  const response = await provider.generate(prompt);
  const jsonStr = extractJSON(response);
  const parsed = analysisResultSchema.parse(JSON.parse(jsonStr));
  const durationMs = Date.now() - startTime;

  return {
    analysis: parsed,
    modelUsed: getProviderName(),
    promptVersion: PROMPT_VERSION,
    durationMs,
    truncated,
  };
}

export async function generateRepositoryContextMarkdown(input: {
  repository: string;
  defaultBranch: string;
  rootEntries: string[];
  files: Array<{ path: string; content: string }>;
}): Promise<string> {
  const provider = getAIProvider();
  const prompt = buildRepoContextPrompt(input);
  return provider.generate(prompt);
}

/**
 * Compress diff using gzip (for storage)
 */
export async function compressDiff(diff: string): Promise<{ compressed: string; originalSize: number }> {
  const encoder = new TextEncoder();
  const data = encoder.encode(diff);

  // Use CompressionStream API (available in Node.js 18+)
  const compressionStream = new CompressionStream("gzip");
  const writer = compressionStream.writable.getWriter();
  writer.write(data);
  writer.close();

  const chunks: Uint8Array[] = [];
  const reader = compressionStream.readable.getReader();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  // Combine chunks and convert to base64
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  // Convert to base64
  const base64 = Buffer.from(combined).toString("base64");

  return {
    compressed: base64,
    originalSize: diff.length,
  };
}

/**
 * Decompress diff from gzip base64
 */
export async function decompressDiff(compressed: string): Promise<string> {
  const data = Buffer.from(compressed, "base64");

  // Use DecompressionStream API
  const decompressionStream = new DecompressionStream("gzip");
  const writer = decompressionStream.writable.getWriter();
  writer.write(new Uint8Array(data));
  writer.close();

  const chunks: Uint8Array[] = [];
  const reader = decompressionStream.readable.getReader();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  // Combine chunks and decode
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  const decoder = new TextDecoder();
  return decoder.decode(combined);
}
