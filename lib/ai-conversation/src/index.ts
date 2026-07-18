import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseConversationRepository } from "./repositories/supabase-conversation-repository.js";
import { createSupabaseMessageRepository } from "./repositories/supabase-message-repository.js";
import { createSupabaseParticipantRepository } from "./repositories/supabase-participant-repository.js";
import { ConversationService } from "./services/conversation-service.js";
import { MessageService } from "./services/message-service.js";
import { ConversationStateService } from "./services/conversation-state-service.js";
import { ParticipantService } from "./services/participant-service.js";

export type ConversationServices = {
  conversations: ConversationService;
  participants: ParticipantService;
  messages: MessageService;
  state: ConversationStateService;
};

export function createConversationServices(client: SupabaseClient): ConversationServices {
  const conversationRepository = createSupabaseConversationRepository(client);
  const participantRepository = createSupabaseParticipantRepository(client);
  const messageRepository = createSupabaseMessageRepository(client);

  return {
    conversations: new ConversationService(conversationRepository),
    participants: new ParticipantService(participantRepository, conversationRepository),
    messages: new MessageService(messageRepository, conversationRepository, participantRepository),
    state: new ConversationStateService(conversationRepository),
  };
}

export * from "./constants.js";
export * from "./errors.js";
export * from "./types.js";
export * from "./services/conversation-service.js";
export * from "./services/conversation-state-service.js";
export * from "./services/participant-service.js";
export * from "./state-machine/index.js";
export * from "./services/message-service.js";
export * from "./repositories/conversation-repository.js";
export * from "./repositories/participant-repository.js";
export * from "./repositories/message-repository.js";
export * from "./repositories/supabase-conversation-repository.js";
export * from "./repositories/supabase-participant-repository.js";
export * from "./repositories/supabase-message-repository.js";
export * from "./message-cache.js";
