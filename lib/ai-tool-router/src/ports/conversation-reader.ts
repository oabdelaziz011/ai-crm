import type { ConversationSnapshot } from "../types.js";

export interface ConversationReader {
  findById(conversationId: string): Promise<ConversationSnapshot | null>;
}
