import { supabase } from "@/lib/supabase";
import type { CustomerProfileContext } from "@/components/customer-profile/types";
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
  profileContext?: CustomerProfileContext;
  navigate: (path: string) => void;
  onCloseProfile?: () => void;
};

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

  static async openWhatsappConversation(input: OpenWhatsappConversationInput): Promise<string> {
    const activeConversationId = input.profileContext?.conversationId?.trim();
    const conversationId =
      activeConversationId ??
      (await ConversationService.findLatestWhatsappConversation(
        input.customerId,
        input.companyId ?? input.profileContext?.companyId,
      ))?.id;

    if (!conversationId) {
      throw new Error("WHATSAPP_CONVERSATION_NOT_FOUND");
    }

    const focused = requestTeamInboxConversationFocus(conversationId);
    if (!focused) {
      queueTeamInboxConversationFocus(conversationId);
      // Absolute escape — never nest-relative (breaks under /dashboard/operations).
      input.navigate(getTeamInboxDashboardHref());
    }

    input.onCloseProfile?.();
    return conversationId;
  }
}
