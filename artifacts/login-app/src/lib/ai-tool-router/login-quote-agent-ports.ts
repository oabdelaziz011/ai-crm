import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseQuoteAgentPorts, type QuoteAgentToolPorts } from "@workspace/ai-tool-router";
import { resolveActiveToolScope } from "@/lib/ai-employees/utilities/tool-scope-context";

/**
 * Official assistant quote ports. Same Supabase command factory as the webhook host.
 * Price visibility follows the login-app employee scope. Nothing here sends a quote.
 */
export function createLoginQuoteAgentPorts(client: SupabaseClient): QuoteAgentToolPorts {
  return createSupabaseQuoteAgentPorts(client, {
    showProductPrices: () => resolveActiveToolScope()?.showProductPrices === true,
  });
}
