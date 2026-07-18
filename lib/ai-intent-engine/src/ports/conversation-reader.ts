import type { ConversationState } from "@workspace/ai-conversation";

export type ConversationSnapshot = {
  id: string;
  company_id: string;
  state: ConversationState;
};

export interface ConversationReader {
  findById(conversationId: string): Promise<ConversationSnapshot | null>;
}
