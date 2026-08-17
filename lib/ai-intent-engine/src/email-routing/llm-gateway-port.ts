/**
 * Minimal surface of the existing AI gateway used by email routing LLM classification.
 * Compatible with AIGatewayService.chatCompletion from @workspace/ai-provider-layer.
 */
export type EmailRoutingChatMessage = {
  role: "system" | "user" | "assistant" | "developer" | "tool";
  content: string;
};

export type EmailRoutingChatRequest = {
  providerKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  messages: EmailRoutingChatMessage[];
  context: {
    companyId: string;
    userId?: string | null;
    conversationId?: string;
    executionId?: string;
  };
  metadata?: Record<string, unknown>;
};

export type EmailRoutingChatGateway = {
  chatCompletion(input: EmailRoutingChatRequest): Promise<{ text: string }>;
};

export type LlmEmailRoutingClassifierOptions = {
  /** Defaults to openai — resolved through existing provider config. */
  providerKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
};
