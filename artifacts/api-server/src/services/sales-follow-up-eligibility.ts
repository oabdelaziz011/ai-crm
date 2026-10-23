/**
 * Real eligibility checks for sales follow-up jobs (tenant-scoped).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isWithinSalesFollowUpBusinessHours,
  loadSalesFollowUpChannelReadiness,
  type SalesFollowUpEligibilitySnapshot,
  type SalesFollowUpJobRecord,
  type SalesFollowUpSettings,
} from "@workspace/automation-platform";

function isInboundMessageType(messageType: string): boolean {
  const type = messageType.toLowerCase();
  return type.includes("customer") || type.includes("inbound") || type.includes("incoming") || type === "user";
}

/** Lead metadata + customer marketing preference — fail closed for promo follow-up. */
export function resolveSalesFollowUpOptedOut(input: {
  leadMetadata: Record<string, unknown>;
  receiveMarketing: boolean | null | undefined;
  stopOnOptOut: boolean;
}): boolean {
  if (!input.stopOnOptOut) return false;
  const meta = input.leadMetadata;
  const leadOptOut =
    meta.optedOut === true || meta.do_not_contact === true || meta.doNotContact === true;
  const marketingOptOut = input.receiveMarketing === false;
  return leadOptOut || marketingOptOut;
}

export async function loadSalesFollowUpEligibility(
  client: SupabaseClient,
  job: SalesFollowUpJobRecord,
  settings: SalesFollowUpSettings,
  now: Date = new Date(),
): Promise<SalesFollowUpEligibilitySnapshot> {
  const channelInSettings = Boolean(job.channel && settings.channels.includes(job.channel));

  // Reply window: any inbound after the job was scheduled (created), not only after dueAt.
  const replySinceIso = (job.createdAt ?? job.dueAt).toISOString();

  const [
    { data: lead },
    { count: sentAttempts },
    { count: sentToday },
    replyCheck,
    channelReadiness,
    sessionCheck,
  ] = await Promise.all([
    client
      .from("leads")
      .select("lifecycle_status, is_qualified, metadata, customer_id")
      .eq("company_id", job.companyId)
      .eq("id", job.leadId)
      .maybeSingle(),
    client
      .from("sales_follow_up_attempts")
      .select("id", { count: "exact", head: true })
      .eq("company_id", job.companyId)
      .eq("lead_id", job.leadId)
      .eq("outcome", "sent"),
    client
      .from("sales_follow_up_attempts")
      .select("id", { count: "exact", head: true })
      .eq("company_id", job.companyId)
      .eq("outcome", "sent")
      .gte("created_at", new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()),
    job.conversationId
      ? client
          .from("conversation_messages")
          .select("id, message_type, created_at")
          .eq("conversation_id", job.conversationId)
          .gt("created_at", replySinceIso)
          .order("created_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] as Array<{ message_type?: string }> }),
    loadSalesFollowUpChannelReadiness(client, {
      companyId: job.companyId,
      companyChannelId: job.companyChannelId,
    }),
    job.conversationId
      ? client
          .from("channel_sessions")
          .select("id, company_channel_id, external_thread_id")
          .eq("conversation_id", job.conversationId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const lifecycle = String(lead?.lifecycle_status ?? "").toLowerCase();
  const metadata =
    lead?.metadata && typeof lead.metadata === "object"
      ? (lead.metadata as Record<string, unknown>)
      : {};
  let receiveMarketing: boolean | null | undefined;
  const customerId = lead?.customer_id ? String(lead.customer_id) : null;
  if (settings.stopOnOptOut && customerId) {
    const { data: pref } = await client
      .from("customer_communication_preferences")
      .select("receive_marketing")
      .eq("company_id", job.companyId)
      .eq("customer_id", customerId)
      .maybeSingle();
    receiveMarketing =
      pref && typeof pref.receive_marketing === "boolean" ? pref.receive_marketing : undefined;
  }

  const optedOut = resolveSalesFollowUpOptedOut({
    leadMetadata: metadata,
    receiveMarketing,
    stopOnOptOut: settings.stopOnOptOut,
  });

  const customerRepliedAfterSchedule = (replyCheck.data ?? []).some((row) =>
    isInboundMessageType(String(row.message_type ?? "")),
  );

  const converted = lifecycle === "converted" || lifecycle === "won";
  const purchased = lifecycle === "purchased" || metadata.purchased === true;
  // Demo journey: pause outbound while scheduled or after human-confirmed completion
  // until an explicit follow-up schedule/approval (never auto-send on stage change).
  const demoPending = lifecycle === "demo_scheduled" || lifecycle === "demo_completed";
  // Disqualify clears is_qualified without always changing lifecycle_status.
  const requestClosed =
    ["closed", "lost", "disqualified", "archived"].includes(lifecycle) ||
    lead?.is_qualified === false ||
    demoPending;

  // Reassignment is cancelled via lead_reassigned lifecycle hook (no assignee snapshot on jobs).
  const assigneeChanged = false;

  const session = sessionCheck.data;
  const sessionOk = Boolean(
    session?.company_channel_id &&
      session?.external_thread_id &&
      (!job.companyChannelId || String(session.company_channel_id) === job.companyChannelId),
  );

  const channelConnected = channelInSettings && channelReadiness.connected;
  const channelCanSend = Boolean(
    channelConnected &&
      channelReadiness.canSend &&
      sessionOk &&
      job.companyChannelId &&
      job.externalThreadId &&
      job.conversationId,
  );

  return {
    optedOut,
    customerRepliedAfterSchedule,
    converted,
    purchased,
    requestClosed: requestClosed && !converted,
    assigneeChanged,
    attemptsAlreadySent: sentAttempts ?? 0,
    companySentToday: sentToday ?? 0,
    channelConnected,
    channelCanSend,
    withinBusinessHours: isWithinSalesFollowUpBusinessHours(now, settings),
  };
}
