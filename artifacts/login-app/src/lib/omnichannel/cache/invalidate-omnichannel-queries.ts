import type { QueryClient } from "@tanstack/react-query";

export function invalidateOmnichannelQueries(
  queryClient: QueryClient,
  input: { companyId: string; conversationId?: string },
): void {
  void queryClient.invalidateQueries({ queryKey: ["omnichannel", "conversations", input.companyId] });
  void queryClient.invalidateQueries({ queryKey: ["conversation-list", input.companyId] });
  if (input.conversationId) {
    void queryClient.invalidateQueries({ queryKey: ["omnichannel", "messages", input.conversationId] });
    void queryClient.invalidateQueries({ queryKey: ["conversation-messages", input.conversationId] });
  }
}
