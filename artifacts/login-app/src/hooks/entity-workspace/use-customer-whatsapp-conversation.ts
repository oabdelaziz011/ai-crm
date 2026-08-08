import { useQuery } from "@tanstack/react-query";
import { ConversationService } from "@/lib/customer-profile/services";

/** Live check — WhatsApp actions must not render without an existing conversation. */
export function useCustomerWhatsappConversation(
  customerId: string | null | undefined,
  companyId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["entity-workspace", "whatsapp-conversation", companyId, customerId],
    enabled: Boolean(customerId),
    queryFn: () => ConversationService.findLatestWhatsappConversation(customerId!, companyId),
  });
}
