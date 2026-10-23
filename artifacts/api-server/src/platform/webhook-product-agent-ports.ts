import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createSupabaseProductAgentToolPorts,
  withProductPriceVisibility,
} from "@workspace/ai-tool-router";
import { resolveActiveToolScope } from "./employee-runtime-bridge.js";
import { recordVerifiedProductInterestForConversation } from "./webhook-product-interest-bridge.js";

export function createWebhookProductAgentPorts(client: SupabaseClient) {
  const base = withProductPriceVisibility(
    createSupabaseProductAgentToolPorts(client),
    () => resolveActiveToolScope()?.showProductPrices,
  );
  return {
    ...base,
    async recordVerifiedProductInterest(input: {
      companyId: string;
      conversationId?: string | null;
      productId: string;
      productName: string | null;
      source?: string;
    }) {
      await recordVerifiedProductInterestForConversation(client, input);
    },
  };
}
