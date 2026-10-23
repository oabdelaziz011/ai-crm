import {
  createSupabaseProductAgentToolPorts,
  withProductPriceVisibility,
} from "@workspace/ai-tool-router";
import { recordVerifiedProductInterestForConversation } from "@workspace/opportunity-platform";
import { resolveActiveToolScope } from "@/lib/ai-employees/utilities/tool-scope-context";

export function createLoginProductAgentPorts(client: Parameters<typeof createSupabaseProductAgentToolPorts>[0]) {
  const ports = withProductPriceVisibility(
    createSupabaseProductAgentToolPorts(client),
    () => resolveActiveToolScope()?.showProductPrices,
  );
  return {
    ...ports,
    recordVerifiedProductInterest(input: {
      companyId: string;
      conversationId?: string | null;
      productId: string;
      productName: string | null;
      source?: string;
    }) {
      return recordVerifiedProductInterestForConversation(client, input);
    },
  };
}
