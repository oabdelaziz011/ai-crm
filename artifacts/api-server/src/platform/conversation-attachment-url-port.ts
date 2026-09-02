import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CONVERSATION_ATTACHMENTS_BUCKET,
  createConversationAttachmentUrlPort,
  type ConversationAttachmentUrlPort,
} from "@workspace/channel-platform";

/**
 * H3: service-role-capable signer that NEVER blind-signs.
 * Always validates live conversation ownership + path segments first.
 */
export function createSupabaseConversationAttachmentUrlPort(
  client: SupabaseClient,
): ConversationAttachmentUrlPort {
  return createConversationAttachmentUrlPort({
    async loadLiveConversation(conversationId) {
      const { data, error } = await client
        .from("conversations")
        .select("id, company_id")
        .eq("id", conversationId)
        .is("deleted_at", null)
        .maybeSingle();

      if (error) throw error;
      if (!data?.id || !data.company_id) return null;
      return { id: String(data.id), companyId: String(data.company_id) };
    },

    async createSignedUrl(storagePath, expiresInSeconds) {
      const { data, error } = await client.storage
        .from(CONVERSATION_ATTACHMENTS_BUCKET)
        .createSignedUrl(storagePath, expiresInSeconds);
      if (error) throw error;
      if (!data?.signedUrl) throw new Error("Failed to sign conversation attachment URL.");
      return data.signedUrl;
    },
  });
}
