import type {
  AgentKnowledgeRetrievalInput,
  AgentKnowledgeRetrievalResult,
  AgentRetrievalPolicy,
  KnowledgeRetrievalPort,
} from "../types.js";

export type {
  AgentKnowledgeRetrievalInput,
  AgentKnowledgeRetrievalResult,
  AgentRetrievalPolicy,
  KnowledgeRetrievalPort,
};

export type AgentKnowledgeCitation = AgentKnowledgeRetrievalResult["citations"][number];
export type AgentKnowledgeChunk = AgentKnowledgeRetrievalResult["chunks"][number];

export type AgentKnowledgeRetrievalStatus =
  | { status: "success"; result: AgentKnowledgeRetrievalResult }
  | { status: "empty"; result: AgentKnowledgeRetrievalResult }
  | { status: "skipped" }
  | { status: "failed"; error: string; policy: AgentRetrievalPolicy };

export const DEFAULT_AGENT_KNOWLEDGE_TOKEN_BUDGET = 2048;

export type AgentKnowledgeExecutionContext = {
  goal: string;
  contextText: string;
  citations: AgentKnowledgeCitation[];
  conversationSummary?: string;
  memorySummary?: string;
  totalTokens: number;
  truncated: boolean;
};
