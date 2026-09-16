import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createConversationServices as createBaseConversationServices,
  type ConversationServices,
  type CreateConversationServicesOptions,
} from "@workspace/ai-conversation";

/**
 * Conversation services factory.
 * Ticket SLA is owned by TicketCommandService — conversation priority must not invent SLA.
 */
export function createConversationServicesWithSla(
  client: SupabaseClient,
  options?: Omit<CreateConversationServicesOptions, "prioritySlaHook">,
): ConversationServices {
  return createBaseConversationServices(client, {
    ...options,
  });
}
