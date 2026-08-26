import type {
  AddMessageInput,
  ConversationMessageRecord,
  ListMessagesFilter,
} from "../types.js";

export interface MessageRepository {
  add(input: AddMessageInput): Promise<ConversationMessageRecord>;
  findById(id: string): Promise<ConversationMessageRecord | null>;
  findByConversationAndExternalMessageId(
    conversationId: string,
    externalMessageId: string,
  ): Promise<ConversationMessageRecord | null>;
  findByConversationAndInboundCorrelationId(
    conversationId: string,
    correlationId: string,
  ): Promise<ConversationMessageRecord | null>;
  list(filter: ListMessagesFilter): Promise<ConversationMessageRecord[]>;
}
