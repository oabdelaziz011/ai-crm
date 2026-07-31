import type {
  AgentKnowledgeCitation,
  AgentKnowledgeExecutionContext,
  AgentKnowledgeRetrievalResult,
} from "./retrieval-types.js";
import { DEFAULT_AGENT_KNOWLEDGE_TOKEN_BUDGET } from "./retrieval-types.js";
import type { AgentMemoryState } from "../types.js";

const APPROX_CHARS_PER_TOKEN = 4;

export type AgentKnowledgeContextBuilderInput = {
  goal: string;
  retrieval?: AgentKnowledgeRetrievalResult | null;
  conversationHistory?: string[];
  memory?: AgentMemoryState;
  maxTokens?: number;
};

export class AgentKnowledgeContextBuilder {
  build(input: AgentKnowledgeContextBuilderInput): AgentKnowledgeExecutionContext {
    const maxTokens = input.maxTokens ?? DEFAULT_AGENT_KNOWLEDGE_TOKEN_BUDGET;
    const citations = input.retrieval?.citations ?? [];
    const retrievalText = input.retrieval?.contextText?.trim() ?? "";

    const conversationSummary = summarizeConversation(input.conversationHistory ?? []);
    const memorySummary = summarizeMemory(input.memory);

    const sections: Array<{ key: string; text: string }> = [
      { key: "goal", text: `User goal:\n${input.goal.trim()}` },
    ];

    if (retrievalText) {
      sections.push({ key: "knowledge", text: `Retrieved knowledge:\n${retrievalText}` });
    }

    if (conversationSummary) {
      sections.push({ key: "conversation", text: `Conversation history:\n${conversationSummary}` });
    }

    if (memorySummary) {
      sections.push({ key: "memory", text: `Execution memory:\n${memorySummary}` });
    }

    const { contextText, truncated, totalTokens } = enforceTokenBudget(sections, maxTokens);

    return {
      goal: input.goal,
      contextText,
      citations,
      conversationSummary: conversationSummary || undefined,
      memorySummary: memorySummary || undefined,
      totalTokens,
      truncated,
    };
  }
}

function summarizeConversation(history: string[]): string {
  if (history.length === 0) return "";
  return history
    .slice(-6)
    .map((entry, index) => `${index + 1}. ${entry.trim()}`)
    .join("\n");
}

function summarizeMemory(memory?: AgentMemoryState): string {
  if (!memory) return "";

  const completed = memory.completedTaskIds.slice(-8);
  const lines: string[] = [];

  if (completed.length > 0) {
    lines.push(`Completed tasks: ${completed.join(", ")}`);
  }

  const toolKeys = Object.keys(memory.toolOutputs).slice(-5);
  for (const taskId of toolKeys) {
    const output = memory.toolOutputs[taskId] as Record<string, unknown> | undefined;
    if (!output) continue;
    if (typeof output.contextText === "string" && output.contextText.trim()) {
      lines.push(`Task ${taskId} knowledge: ${output.contextText.slice(0, 240)}`);
      continue;
    }
    if (Array.isArray(output.results)) {
      lines.push(`Task ${taskId} results: ${output.results.length} item(s)`);
    }
  }

  return lines.join("\n");
}

function enforceTokenBudget(
  sections: Array<{ key: string; text: string }>,
  maxTokens: number,
): { contextText: string; truncated: boolean; totalTokens: number } {
  let truncated = false;
  const parts: string[] = [];
  let usedTokens = 0;

  for (const section of sections) {
    const sectionTokens = estimateTokens(section.text);
    if (usedTokens + sectionTokens <= maxTokens) {
      parts.push(section.text);
      usedTokens += sectionTokens;
      continue;
    }

    const remaining = Math.max(0, maxTokens - usedTokens);
    if (remaining <= 0) {
      truncated = true;
      break;
    }

    const trimmed = trimToTokenBudget(section.text, remaining);
    if (trimmed) {
      parts.push(`${trimmed}\n[truncated]`);
      usedTokens += estimateTokens(trimmed);
    }
    truncated = true;
    break;
  }

  const contextText = parts.join("\n\n");
  return { contextText, truncated, totalTokens: estimateTokens(contextText) };
}

function trimToTokenBudget(text: string, tokenBudget: number): string {
  const maxChars = Math.max(0, tokenBudget * APPROX_CHARS_PER_TOKEN);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars).trim()}…`;
}

function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / APPROX_CHARS_PER_TOKEN);
}

export function mapCitationsForToolOutput(citations: AgentKnowledgeCitation[]) {
  return citations.map((citation) => ({
    source: citation.sourceId,
    title: citation.title,
    chunkId: citation.chunkId,
    confidence: citation.confidence,
    score: citation.score,
    excerpt: citation.excerpt,
  }));
}

export function buildKnowledgeToolOutput(result: AgentKnowledgeRetrievalResult) {
  const citations = mapCitationsForToolOutput(result.citations);
  return {
    results: citations.map((citation) => ({
      title: citation.title,
      excerpt: citation.excerpt,
      confidence: citation.confidence,
      chunkId: citation.chunkId,
      source: citation.source,
    })),
    items: citations,
    matches: citations,
    contextText: result.contextText,
    citations,
    confidence: result.confidence,
    chunkCount: result.chunkCount,
    totalTokens: result.totalTokens,
    searchMode: result.searchMode,
    executionId: result.executionId,
    vectorQueryExecutionId: result.vectorQueryExecutionId,
  };
}
