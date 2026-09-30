import { type ServiceContext } from "@workspace/ai-conversation";
import { requireCompanyFeature } from "@/lib/billing/require-company-feature";
import { supabase } from "@/lib/supabase";
import type { CustomerProfileContext } from "@/components/customer-profile/types";
import { isWhatsAppCompanyChannel } from "@/lib/omnichannel/tenant/diagnose-inbox-empty-state";
import { customerSmsOpenConversationHref } from "@/lib/customer-workspace/customer-sms-timeline";
import {
  getTeamInboxDashboardHref,
  queueTeamInboxConversationFocus,
  requestTeamInboxConversationFocus,
} from "./inbox-navigation";
import { createConversationServicesWithSla } from "@/lib/ai-conversation/create-conversation-services-with-sla";

export type WhatsappConversationRef = {
  id: string;
  conversationNumber: string;
  lastMessageAt: string | null;
};

export type OpenWhatsappConversationInput = {
  customerId: string;
  companyId?: string | null;
  /** Used to create an outbound thread when none exists yet. */
  phone?: string | null;
  profileContext?: CustomerProfileContext;
  navigate: (path: string) => void;
  onCloseProfile?: () => void;
  hasPermission?: (code: string) => boolean;
};

export type OpenSmsConversationInput = {
  customerId: string;
  companyId?: string | null;
  phone?: string | null;
  navigate: (path: string) => void;
  hasPermission?: (code: string) => boolean;
};

type CompanyChannelRow = {
  id: string;
  is_enabled: boolean | null;
  deleted_at: string | null;
  communication_channel?: { key?: string } | { key?: string }[] | null;
};

function channelKey(row: CompanyChannelRow): string {
  const embedded = row.communication_channel;
  if (Array.isArray(embedded)) return embedded[0]?.key ?? "";
  return embedded?.key ?? "";
}

function isEnabledSmsCompanyChannel(channel: CompanyChannelRow): boolean {
  return channelKey(channel) === "sms" && channel.is_enabled === true && !channel.deleted_at;
}

async function resolveWhatsappOutboundTargets(companyId: string): Promise<{
  channelId: string;
  assistantId: string;
} | null> {
  const [{ data: channels, error: channelsError }, { data: assistant, error: assistantError }] =
    await Promise.all([
      supabase
        .from("company_channels")
        .select("id, is_enabled, deleted_at, communication_channel(key)")
        .eq("company_id", companyId)
        .is("deleted_at", null),
      supabase
        .from("ai_assistant_settings")
        .select("id")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .maybeSingle(),
    ]);

  if (channelsError) throw new Error(channelsError.message);
  if (assistantError) throw new Error(assistantError.message);

  const whatsappChannel = (channels ?? []).find((channel) =>
    isWhatsAppCompanyChannel(channel as Parameters<typeof isWhatsAppCompanyChannel>[0]),
  );
  if (!whatsappChannel?.id || !assistant?.id) return null;

  return { channelId: String(whatsappChannel.id), assistantId: String(assistant.id) };
}

async function resolveSmsOutboundTargets(companyId: string): Promise<{
  channelId: string;
  assistantId: string;
} | null> {
  const [{ data: channels, error: channelsError }, { data: assistant, error: assistantError }] =
    await Promise.all([
      supabase
        .from("company_channels")
        .select("id, is_enabled, deleted_at, communication_channel(key)")
        .eq("company_id", companyId)
        .is("deleted_at", null),
      supabase
        .from("ai_assistant_settings")
        .select("id")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .maybeSingle(),
    ]);

  if (channelsError) throw new Error(channelsError.message);
  if (assistantError) throw new Error(assistantError.message);

  const smsChannel = ((channels as CompanyChannelRow[] | null) ?? []).find(isEnabledSmsCompanyChannel);
  if (!smsChannel?.id || !assistant?.id) return null;

  return { channelId: String(smsChannel.id), assistantId: String(assistant.id) };
}

function focusConversation(conversationId: string, navigate: (path: string) => void): void {
  const focused = requestTeamInboxConversationFocus(conversationId);
  if (!focused) {
    queueTeamInboxConversationFocus(conversationId);
    navigate(getTeamInboxDashboardHref());
  }
}

export class ConversationService {
  static async findLatestWhatsappConversation(
    customerId: string,
    companyId?: string | null,
  ): Promise<WhatsappConversationRef | null> {
    let query = supabase
      .from("conversations")
      .select("id, conversation_number, last_message_at")
      .eq("customer_id", customerId)
      .eq("channel_type", "whatsapp")
      .is("deleted_at", null)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(1);

    if (companyId) {
      query = query.eq("company_id", companyId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;

    return {
      id: data.id,
      conversationNumber: data.conversation_number,
      lastMessageAt: data.last_message_at,
    };
  }

  static async findLatestSmsConversation(
    customerId: string,
    companyId?: string | null,
  ): Promise<WhatsappConversationRef | null> {
    let query = supabase
      .from("conversations")
      .select("id, conversation_number, last_message_at")
      .eq("customer_id", customerId)
      .eq("channel_type", "sms")
      .is("deleted_at", null)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(1);

    if (companyId) {
      query = query.eq("company_id", companyId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;

    return {
      id: data.id,
      conversationNumber: data.conversation_number,
      lastMessageAt: data.last_message_at,
    };
  }

  static async createOutboundWhatsappConversation(input: {
    customerId: string;
    companyId: string;
    phone: string;
    hasPermission?: (code: string) => boolean;
  }): Promise<string> {
    await requireCompanyFeature(supabase, input.companyId, "whatsapp_channel");
    const targets = await resolveWhatsappOutboundTargets(input.companyId);
    if (!targets) {
      throw new Error("WHATSAPP_CONVERSATION_NOT_FOUND");
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const services = createConversationServicesWithSla(supabase);
    const ctx: ServiceContext = {
      userId: user.id,
      companyId: input.companyId,
      isSuperAdmin: false,
      hasPermission: input.hasPermission ?? (() => false),
    };

    const created = await services.conversations.createConversation(ctx, {
      companyId: input.companyId,
      aiAssistantId: targets.assistantId,
      channelType: "whatsapp",
      companyChannelId: targets.channelId,
      customerId: input.customerId,
      externalThreadId: input.phone,
      metadata: {
        phone: input.phone,
        source: "customer_crm_whatsapp",
      },
    });

    return created.id;
  }

  static async createOutboundSmsConversation(input: {
    customerId: string;
    companyId: string;
    phone: string;
    hasPermission?: (code: string) => boolean;
  }): Promise<string> {
    await requireCompanyFeature(supabase, input.companyId, "sms_channel");
    const targets = await resolveSmsOutboundTargets(input.companyId);
    if (!targets) {
      throw new Error("SMS_CONVERSATION_NOT_FOUND");
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const services = createConversationServicesWithSla(supabase);
    const ctx: ServiceContext = {
      userId: user.id,
      companyId: input.companyId,
      isSuperAdmin: false,
      hasPermission: input.hasPermission ?? (() => false),
    };

    const created = await services.conversations.createConversation(ctx, {
      companyId: input.companyId,
      aiAssistantId: targets.assistantId,
      channelType: "sms",
      companyChannelId: targets.channelId,
      customerId: input.customerId,
      externalThreadId: input.phone,
      metadata: {
        phone: input.phone,
        customerPhone: input.phone,
        source: "customer_crm_sms",
      },
    });

    return created.id;
  }

  static async openWhatsappConversation(input: OpenWhatsappConversationInput): Promise<string> {
    const companyId = input.companyId ?? input.profileContext?.companyId ?? null;
    if (!companyId) {
      throw new Error("WHATSAPP_CONVERSATION_NOT_FOUND");
    }
    await requireCompanyFeature(supabase, companyId, "whatsapp_channel");

    const activeConversationId = input.profileContext?.conversationId?.trim();
    let conversationId =
      activeConversationId ??
      (await ConversationService.findLatestWhatsappConversation(input.customerId, companyId))?.id ??
      null;

    if (!conversationId) {
      const phone = input.phone?.trim() || null;
      if (!companyId || !phone) {
        throw new Error("WHATSAPP_CONVERSATION_NOT_FOUND");
      }
      conversationId = await ConversationService.createOutboundWhatsappConversation({
        customerId: input.customerId,
        companyId,
        phone,
        hasPermission: input.hasPermission,
      });
    }

    focusConversation(conversationId, input.navigate);
    input.onCloseProfile?.();
    return conversationId;
  }

  static async openSmsConversation(input: OpenSmsConversationInput): Promise<string> {
    const companyId = input.companyId ?? null;
    if (!companyId) {
      throw new Error("SMS_CONVERSATION_NOT_FOUND");
    }
    await requireCompanyFeature(supabase, companyId, "sms_channel");

    let conversationId =
      (await ConversationService.findLatestSmsConversation(input.customerId, companyId))?.id ?? null;

    if (!conversationId) {
      const phone = input.phone?.trim() || null;
      if (!phone) {
        throw new Error("SMS_CONVERSATION_NOT_FOUND");
      }
      conversationId = await ConversationService.createOutboundSmsConversation({
        customerId: input.customerId,
        companyId,
        phone,
        hasPermission: input.hasPermission,
      });
    }

    input.navigate(customerSmsOpenConversationHref(conversationId));
    return conversationId;
  }
}
