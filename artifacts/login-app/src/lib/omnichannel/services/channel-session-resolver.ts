import { supabase } from "@/lib/supabase";
import type { ChannelSessionRow } from "@/lib/omnichannel/services/outbound-delivery";

export async function resolveChannelSession(conversationId: string): Promise<ChannelSessionRow | null> {
  const { data } = await supabase
    .from("channel_sessions")
    .select("id, external_thread_id, channel_key, company_channel_id")
    .eq("conversation_id", conversationId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}
