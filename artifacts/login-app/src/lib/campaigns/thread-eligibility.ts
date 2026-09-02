import type { SupabaseClient } from "@supabase/supabase-js";
import type { MarketingCampaignChannel } from "./types";
import { META_MESSAGING_RESPONSE_WINDOW_MS } from "./types";

export type MetaMessagingChannelKey = Extract<MarketingCampaignChannel, "instagram" | "messenger">;

export type CampaignThreadBinding = {
  conversationId: string;
  channelSessionId: string;
  companyChannelId: string;
  externalThreadId: string;
  channelKey: MetaMessagingChannelKey;
  lastInboundAt: string | null;
  customerId: string;
};

export type ThreadEligibilityResult =
  | { eligible: true; binding: CampaignThreadBinding }
  | { eligible: false; reason: string };

type ConversationRow = {
  id: string;
  company_id: string;
  customer_id: string | null;
  channel_type: string;
  deleted_at: string | null;
};

type SessionRow = {
  id: string;
  company_id: string;
  company_channel_id: string;
  conversation_id: string;
  channel_key: string;
  external_thread_id: string | null;
  session_status: string;
  last_inbound_at: string | null;
};

/**
 * Resolve an existing IG/Messenger conversation+session for a CRM customer.
 * Does not invent IGSID/PSID. Uses channel_sessions / conversations only.
 */
export class CampaignThreadEligibilityResolver {
  constructor(
    private readonly client: SupabaseClient,
    private readonly nowMs: () => number = () => Date.now(),
  ) {}

  async resolveForCustomer(input: {
    companyId: string;
    customerId: string;
    channel: MetaMessagingChannelKey;
  }): Promise<ThreadEligibilityResult> {
    const { data: conversations, error: convError } = await this.client
      .from("conversations")
      .select("id, company_id, customer_id, channel_type, deleted_at")
      .eq("company_id", input.companyId)
      .eq("customer_id", input.customerId)
      .eq("channel_type", input.channel)
      .is("deleted_at", null)
      .order("last_message_at", { ascending: false });

    if (convError) throw new Error(convError.message);
    const convRows = (conversations as ConversationRow[] | null) ?? [];
    if (convRows.length === 0) {
      return {
        eligible: false,
        reason: `no_${input.channel}_conversation_for_customer`,
      };
    }

    for (const conversation of convRows) {
      if (conversation.company_id !== input.companyId) continue;
      if (conversation.customer_id !== input.customerId) continue;

      const { data: sessions, error: sessionError } = await this.client
        .from("channel_sessions")
        .select(
          "id, company_id, company_channel_id, conversation_id, channel_key, external_thread_id, session_status, last_inbound_at",
        )
        .eq("company_id", input.companyId)
        .eq("conversation_id", conversation.id)
        .eq("channel_key", input.channel)
        .eq("session_status", "active")
        .order("last_inbound_at", { ascending: false });

      if (sessionError) throw new Error(sessionError.message);
      const sessionRows = (sessions as SessionRow[] | null) ?? [];

      for (const session of sessionRows) {
        if (session.company_id !== input.companyId) {
          return { eligible: false, reason: "session_company_mismatch" };
        }
        const externalThreadId = session.external_thread_id?.trim() ?? "";
        if (!externalThreadId) {
          return {
            eligible: false,
            reason: input.channel === "instagram" ? "missing_igsid" : "missing_psid",
          };
        }

        if (!isWithinMessagingResponseWindow(session.last_inbound_at, this.nowMs())) {
          return {
            eligible: false,
            reason: "messaging_window_not_eligible",
          };
        }

        return {
          eligible: true,
          binding: {
            conversationId: conversation.id,
            channelSessionId: session.id,
            companyChannelId: session.company_channel_id,
            externalThreadId,
            channelKey: input.channel,
            lastInboundAt: session.last_inbound_at,
            customerId: input.customerId,
          },
        };
      }
    }

    return {
      eligible: false,
      reason: `no_active_${input.channel}_session`,
    };
  }
}

export function isWithinMessagingResponseWindow(
  lastInboundAt: string | null | undefined,
  nowMs: number = Date.now(),
  windowMs: number = META_MESSAGING_RESPONSE_WINDOW_MS,
): boolean {
  if (!lastInboundAt) return false;
  const inboundMs = Date.parse(lastInboundAt);
  if (Number.isNaN(inboundMs)) return false;
  return nowMs - inboundMs <= windowMs;
}

/** Render shared campaign content as plain text for IG/Messenger outbound DTO. */
export function renderMetaMessagingCampaignText(content: {
  campaignTitle: string;
  detail: string;
}): string {
  const title = content.campaignTitle.trim();
  const detail = content.detail.trim();
  if (title && detail) return `${title}\n\n${detail}`;
  return title || detail;
}
