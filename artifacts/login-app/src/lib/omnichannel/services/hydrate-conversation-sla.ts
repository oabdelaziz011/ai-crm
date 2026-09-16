import type { ConversationRecord, ConversationServices, ServiceContext } from "@workspace/ai-conversation";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Ticket-centric SLA: conversation list hydration must NOT invent lifecycle.slaDueAt.
 * Authoritative SLA lives on support_tickets; Omnichannel reads ticket context at display time.
 * Kept as a pass-through so callers remain stable without N+1 metadata writes.
 */
export async function hydrateConversationSlaDueAtBatch(input: {
  client: SupabaseClient;
  services: ConversationServices;
  ctx: ServiceContext;
  conversations: ConversationRecord[];
}): Promise<ConversationRecord[]> {
  void input.client;
  void input.services;
  void input.ctx;
  return input.conversations;
}
