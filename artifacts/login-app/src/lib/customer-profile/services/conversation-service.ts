import { createConversationServices, type ServiceContext } from "@workspace/ai-conversation";
import { supabase } from "@/lib/supabase";
import type { CustomerProfileContext } from "@/components/customer-profile/types";
import { isWhatsAppCompanyChannel } from "@/lib/omnichannel/tenant/diagnose-inbox-empty-state";
import {
  getTeamInboxDashboardHref,
  queueTeamInboxConversationFocus,
  requestTeamInboxConversationFocus,
} from "./inbox-navigation";

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
};

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

  static async createOutboundWhatsappConversation(input: {
    customerId: string;
    companyId: string;
    phone: string;
  }): Promise<string> {
    const targets = await resolveWhatsappOutboundTargets(input.companyId);
    if (!targets) {
      throw new Error("WHATSAPP_CONVERSATION_NOT_FOUND");
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const services = createConversationServices(supabase);
    const ctx: ServiceContext = {
      userId: user.id,
      companyId: input.companyId,
      isSuperAdmin: false,
      // CRM outbound compose from customer / booking actions.
      hasPermission: () => true,
    };

    const created = await services.conversations.createConversation(ctx, {
      companyId: input.companyId,
      aiAssistantId: targets.assistantId,
      channelType: "whatsapp",
      companyChannelId: targets.channelId,
      customerId: input.customerId,
      metadata: {
        phone: input.phone,
        source: "customer_crm_whatsapp",
      },
    });

    return created.id;
  }

  static async openWhatsappConversation(input: OpenWhatsappConversationInput): Promise<string> {
    const companyId = input.companyId ?? input.profileContext?.companyId ?? null;
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
      });
    }

    focusConversation(conversationId, input.navigate);
    input.onCloseProfile?.();
    return conversationId;
  }
}
