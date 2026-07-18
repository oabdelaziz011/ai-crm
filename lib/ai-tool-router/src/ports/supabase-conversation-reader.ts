import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConversationReader } from "../ports/conversation-reader.js";
import type { ConversationSnapshot } from "../types.js";

export function createSupabaseConversationReader(client: SupabaseClient): ConversationReader {
  return {
    async findById(conversationId: string): Promise<ConversationSnapshot | null> {
      const { data, error } = await client
        .from("conversations")
        .select("id, company_id, state")
        .eq("id", conversationId)
        .is("deleted_at", null)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        id: data.id as string,
        company_id: data.company_id as string,
        state: data.state as ConversationSnapshot["state"],
      };
    },
  };
}
