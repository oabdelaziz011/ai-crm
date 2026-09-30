import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicWebChatChannelResolver } from "./public-web-chat-tool-policy.js";

export const WEB_WIDGET_CHANNEL_PROVIDER = "valueor.web_widget";

const MAX_CACHE_ENTRIES = 5_000;

function remember(cache: Map<string, boolean>, key: string, value: boolean): boolean {
  if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();
  cache.set(key, value);
  return value;
}

/**
 * Channel provider is immutable for widget rows (DB guard) and a conversation never
 * changes company_channel_id, so positive and negative answers are safe to cache.
 */
export function createPublicWebChatChannelResolver(client: SupabaseClient): PublicWebChatChannelResolver {
  const channelCache = new Map<string, boolean>();
  const conversationCache = new Map<string, boolean>();

  const isPublicWebChatChannel = async (companyChannelId: string): Promise<boolean> => {
    const cached = channelCache.get(companyChannelId);
    if (cached !== undefined) return cached;
    const { data, error } = await client
      .from("company_channels")
      .select("provider")
      .eq("id", companyChannelId)
      .maybeSingle();
    if (error) throw error;
    return remember(channelCache, companyChannelId, data?.provider === WEB_WIDGET_CHANNEL_PROVIDER);
  };

  return {
    isPublicWebChatChannel,
    async isPublicWebChatConversation(conversationId: string): Promise<boolean> {
      const cached = conversationCache.get(conversationId);
      if (cached !== undefined) return cached;
      const { data, error } = await client
        .from("conversations")
        .select("channel_type, company_channel_id")
        .eq("id", conversationId)
        .maybeSingle();
      if (error) throw error;
      const isPublic =
        data?.channel_type === "web_chat" && typeof data.company_channel_id === "string"
          ? await isPublicWebChatChannel(data.company_channel_id)
          : false;
      return remember(conversationCache, conversationId, isPublic);
    },
  };
}
