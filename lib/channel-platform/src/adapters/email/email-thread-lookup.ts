import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmailMessageId } from "./email-html-utils.js";
import type { EmailThreadLookupPort } from "../adapters/email/email-thread-resolver.js";

export function createSupabaseEmailThreadLookup(client: SupabaseClient): EmailThreadLookupPort {
  return {
    async findByExternalMessageId(companyChannelId, externalMessageId) {
      const normalized = normalizeEmailMessageId(externalMessageId);
      if (!normalized) return null;

      const { data: messageRow, error: messageError } = await client
        .from("conversation_messages")
        .select("conversation_id")
        .eq("external_message_id", normalized)
        .maybeSingle();

      if (messageError) throw messageError;
      if (!messageRow?.conversation_id) return null;

      const { data: sessionRow, error: sessionError } = await client
        .from("channel_sessions")
        .select("external_thread_id")
        .eq("company_channel_id", companyChannelId)
        .eq("conversation_id", messageRow.conversation_id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sessionError) throw sessionError;

      const externalThreadId =
        typeof sessionRow?.external_thread_id === "string" && sessionRow.external_thread_id.trim()
          ? sessionRow.external_thread_id
          : normalized;

      return {
        conversationId: messageRow.conversation_id as string,
        externalThreadId,
      };
    },
  };
}
