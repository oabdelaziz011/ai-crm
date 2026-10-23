/**
 * Schedule / cancel follow-up ladders from lead lifecycle events.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SalesFollowUpChannel } from "./sales-follow-up.js";
import { loadSalesFollowUpSettings } from "./sales-follow-up-store.js";
import {
  cancelPendingSalesFollowUpJobsForLead,
  scheduleSalesFollowUpLadder,
  type ScheduleSalesFollowUpLadderResult,
} from "./sales-follow-up-orchestrate.js";

async function resolveConversationRoute(
  client: SupabaseClient,
  conversationId: string,
): Promise<{
  companyChannelId: string | null;
  externalThreadId: string | null;
  channel: SalesFollowUpChannel | null;
}> {
  const { data: session } = await client
    .from("channel_sessions")
    .select("company_channel_id, external_thread_id, channel_key")
    .eq("conversation_id", conversationId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const channelKey = String(session?.channel_key ?? "").toLowerCase();
  const channelMap: Record<string, SalesFollowUpChannel> = {
    whatsapp: "whatsapp",
    web_chat: "web_chat",
    email: "email",
    instagram: "instagram",
    messenger: "facebook",
    facebook: "facebook",
    sms: "sms",
  };

  return {
    companyChannelId: session?.company_channel_id ? String(session.company_channel_id) : null,
    externalThreadId: session?.external_thread_id ? String(session.external_thread_id) : null,
    channel: channelMap[channelKey] ?? null,
  };
}

export async function scheduleSalesFollowUpAfterLeadQualified(
  client: SupabaseClient,
  input: { companyId: string; leadId: string },
): Promise<ScheduleSalesFollowUpLadderResult | { scheduled: false; reason: string }> {
  const settings = await loadSalesFollowUpSettings(client, input.companyId);
  if (!settings.enabled) {
    return { scheduled: false, reason: "automation_disabled" };
  }

  const { data: lead, error } = await client
    .from("leads")
    .select("id, conversation_id, lifecycle_status, qualified_at, updated_at")
    .eq("company_id", input.companyId)
    .eq("id", input.leadId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!lead?.conversation_id) {
    return { scheduled: false, reason: "no_conversation" };
  }

  const route = await resolveConversationRoute(client, String(lead.conversation_id));
  const anchorRaw = lead.qualified_at ?? lead.updated_at;
  const anchorAt = anchorRaw ? new Date(String(anchorRaw)) : new Date();
  return scheduleSalesFollowUpLadder(client, {
    companyId: input.companyId,
    leadId: input.leadId,
    conversationId: String(lead.conversation_id),
    companyChannelId: route.companyChannelId,
    externalThreadId: route.externalThreadId,
    channel: route.channel,
    anchorAt: Number.isNaN(anchorAt.getTime()) ? new Date() : anchorAt,
  });
}

/** Cancel pending follow-ups for the lead linked to an opportunity (won/lost). */
export async function cancelSalesFollowUpForOpportunity(
  client: SupabaseClient,
  input: { companyId: string; opportunityId: string; reason: string },
): Promise<number> {
  const { data: opportunity, error } = await client
    .from("opportunities")
    .select("lead_id")
    .eq("company_id", input.companyId)
    .eq("id", input.opportunityId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const leadId = opportunity?.lead_id ? String(opportunity.lead_id) : null;
  if (!leadId) return 0;
  return cancelPendingSalesFollowUpJobsForLead(client, {
    companyId: input.companyId,
    leadId,
    reason: input.reason,
  });
}

export async function cancelSalesFollowUpAfterLeadStop(
  client: SupabaseClient,
  input: { companyId: string; leadId: string; reason: string },
): Promise<number> {
  return cancelPendingSalesFollowUpJobsForLead(client, input);
}
