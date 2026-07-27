import type {
  ConversationSnapshot,
  ExecutionSnapshot,
  IntentSnapshot,
  MessageSnapshot,
  PromptSnapshot,
  ProviderSnapshot,
  RetrievalSnapshot,
  ServiceContext,
} from "../types.js";

/** Cross-module port — no direct repository access to conversation module. */
export interface ConversationReadPort {
  findConversation(conversationId: string): Promise<ConversationSnapshot | null>;
  listRecentMessages(conversationId: string, limit?: number): Promise<MessageSnapshot[]>;
  addIncomingMessage(
    ctx: ServiceContext,
    input: { conversationId: string; content: string; metadata?: Record<string, unknown> },
  ): Promise<MessageSnapshot>;
  addOutgoingMessage(
    ctx: ServiceContext,
    input: { conversationId: string; content: string; metadata?: Record<string, unknown> },
  ): Promise<MessageSnapshot>;
}

/** Cross-module port — conversation state resolution. */
export interface ConversationStateReadPort {
  getCurrentState(ctx: ServiceContext, conversationId: string): Promise<string>;
}

/** Cross-module port — intent resolution. */
export interface IntentReadPort {
  resolveIntent(
    ctx: ServiceContext,
    input: { conversationId: string; messageText: string },
  ): Promise<IntentSnapshot>;
}

/** Cross-module port — knowledge retrieval coordination. */
export interface RetrievalReadPort {
  runRetrieval(
    ctx: ServiceContext,
    input: {
      companyId: string;
      correlationId: string;
      question?: string;
      embeddingConnectionId?: string;
      vectorStoreConnectionId?: string;
      /** @deprecated Use vectorStoreConnectionId */
      connectionId?: string;
      collectionId: string;
      /** @deprecated Question-based retrieval preferred */
      queryVector?: number[];
      /** @deprecated Question-based retrieval preferred */
      embeddingId?: string;
    },
  ): Promise<{ vectorQueryExecutionId: string; retrieval: RetrievalSnapshot }>;
}

/** Cross-module port — prompt construction. */
export interface PromptReadPort {
  buildPrompt(
    ctx: ServiceContext,
    input: {
      companyId: string;
      conversationId: string;
      conversationState: string;
      messageText: string;
      recentMessages: MessageSnapshot[];
      intent: IntentSnapshot;
      retrieval: RetrievalSnapshot | null;
      pageContext?: Record<string, unknown>;
    },
  ): Promise<PromptSnapshot>;
}

/** Cross-module port — AI execution. */
export interface ExecutionReadPort {
  execute(
    ctx: ServiceContext,
    input: {
      companyId: string;
      conversationId: string;
      promptBuildId: string;
      providerConnectionId?: string | null;
      policy?: { streaming?: boolean };
      onStreamChunk?: (chunk: string) => void;
      abortSignal?: AbortSignal | null;
    },
  ): Promise<ExecutionSnapshot>;
}

/** Cross-module port — provider metadata resolution. */
export interface ProviderReadPort {
  resolveProvider(
    ctx: ServiceContext,
    input: { companyId: string; providerConnectionId?: string | null },
  ): Promise<ProviderSnapshot>;
}

export type RuntimeEnginePorts = {
  conversation: ConversationReadPort;
  state: ConversationStateReadPort;
  intent: IntentReadPort;
  retrieval: RetrievalReadPort;
  prompt: PromptReadPort;
  execution: ExecutionReadPort;
  provider: ProviderReadPort;
};
