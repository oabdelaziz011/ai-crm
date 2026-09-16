import { useQuery } from "@tanstack/react-query";
import { useConversationServices } from "@/lib/ai-conversation";
import { PermissionDeniedError } from "@workspace/ai-conversation";
import { supabase } from "@/lib/supabase";
import { useTicketServiceContext } from "@/hooks/tickets/use-ticket-services";
import { ticketsQueryKey } from "@/hooks/tickets/use-tickets";
import {
  mapConversationMessageToTicket360Row,
  sortTicket360MessagesChronological,
  type Ticket360MessageRow,
} from "@/lib/tickets/ticket360-tab-models";

export type TicketConversationTranscript = {
  conversationId: string;
  channelType: string | null;
  state: string | null;
  messages: Ticket360MessageRow[];
  denial: "not_found" | "permission" | null;
};

/**
 * Ticket-scoped conversation transcript:
 * - Requires tickets.view + company session
 * - Loads conversation by company_id + conversation_id only (no phone/fuzzy match)
 * - Does NOT mark the Omnichannel thread as read
 */
export function useTicketConversationTranscript(conversationId: string | null | undefined) {
  const { companyId, canView } = useTicketServiceContext();
  const { services, context } = useConversationServices();

  return useQuery({
    queryKey: ticketsQueryKey.conversation(companyId, conversationId ?? null),
    enabled: Boolean(companyId && conversationId && canView),
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<TicketConversationTranscript | null> => {
      if (!companyId || !conversationId) return null;

      const { data: conversation, error: conversationError } = await supabase
        .from("conversations")
        .select("id, channel_type, state, company_id")
        .eq("company_id", companyId)
        .eq("id", conversationId)
        .maybeSingle();

      if (conversationError) throw new Error(conversationError.message);
      if (!conversation || String(conversation.company_id) !== companyId) {
        return {
          conversationId,
          channelType: null,
          state: null,
          messages: [],
          denial: "not_found",
        };
      }

      try {
        const rows = await services.messages.listMessages(context, {
          conversationId,
          limit: 200,
          markEmployeeRead: false,
        });
        const mapped = sortTicket360MessagesChronological(
          rows
            .filter((row) => row.conversation_id === conversationId)
            .map((row) => mapConversationMessageToTicket360Row(row)),
        );
        return {
          conversationId,
          channelType: conversation.channel_type ? String(conversation.channel_type) : null,
          state: conversation.state ? String(conversation.state) : null,
          messages: mapped,
          denial: null,
        };
      } catch (error) {
        if (error instanceof PermissionDeniedError) {
          return {
            conversationId,
            channelType: conversation.channel_type ? String(conversation.channel_type) : null,
            state: conversation.state ? String(conversation.state) : null,
            messages: [],
            denial: "permission",
          };
        }
        throw error;
      }
    },
  });
}
