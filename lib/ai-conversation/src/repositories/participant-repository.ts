import type { AddParticipantInput, ConversationParticipantRecord } from "../types.js";

export interface ParticipantRepository {
  add(input: AddParticipantInput): Promise<ConversationParticipantRecord>;
  findById(id: string): Promise<ConversationParticipantRecord | null>;
  listByConversation(conversationId: string): Promise<ConversationParticipantRecord[]>;
  remove(participantId: string, removedBy?: string | null): Promise<ConversationParticipantRecord>;
}
