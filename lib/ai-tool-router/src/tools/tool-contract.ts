import type { ConversationState } from "@workspace/ai-conversation";

export type ToolExecutionContext = {
  companyId: string;
  conversationId: string;
  conversationState: ConversationState;
  userId: string | null;
  aiAssistantId?: string | null;
  /**
   * Trusted conversation customer (conversations.customer_id).
   * Never accept LLM-supplied customerId for ownership / search scoping.
   */
  trustedCustomerId?: string | null;
};

export interface Tool {
  execute(context: ToolExecutionContext, input: Record<string, unknown>): Promise<Record<string, unknown>>;
  validate(input: Record<string, unknown>): void;
  supports(state: ConversationState): boolean;
}

export type ToolHandlerRegistry = {
  get(key: string): Tool | undefined;
  has(key: string): boolean;
  keys(): string[];
};

export function createToolHandlerRegistry(handlers: Record<string, Tool>): ToolHandlerRegistry {
  const map = new Map(Object.entries(handlers));

  return {
    get(key: string) {
      return map.get(key);
    },
    has(key: string) {
      return map.has(key);
    },
    keys() {
      return [...map.keys()];
    },
  };
}
