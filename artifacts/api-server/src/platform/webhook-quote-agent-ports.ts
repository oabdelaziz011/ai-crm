/**
 * Webhook host for the shared quote ports.
 * Price visibility comes from the API employee tool scope.
 * Draft create and the human send-request queue never send, approve, or convert.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createQuoteDeliveryCommandDeps,
  createQuoteDraftCommandDeps,
  createSupabaseQuoteAgentPorts,
  type QuoteAgentToolPorts,
} from "@workspace/ai-tool-router";
import { resolveActiveToolScope } from "./employee-runtime-bridge.js";

export { createQuoteDeliveryCommandDeps, createQuoteDraftCommandDeps };

export function createWebhookQuoteAgentPorts(client: SupabaseClient): QuoteAgentToolPorts {
  return createSupabaseQuoteAgentPorts(client, {
    showProductPrices: () => resolveActiveToolScope()?.showProductPrices === true,
  });
}
