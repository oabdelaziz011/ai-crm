import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createSupabaseCustomerServicePort,
  resolveCompanyActorUserId,
} from "@workspace/automation-platform";
import { resolveTrustedChannelCustomer } from "@workspace/ai-tool-router";
import type { ChannelCustomerIdentityPort } from "@workspace/channel-platform";

/**
 * Phase 2 — WhatsApp sender → company-scoped CRM identity.
 * Uses CustomerService.findCustomer (exact phone variants only). Never Customer360.
 */
export function createWebhookChannelCustomerIdentityPort(
  client: SupabaseClient,
): ChannelCustomerIdentityPort {
  const customerService = createSupabaseCustomerServicePort(client, {
    resolveActorUserIdForCompany: (companyId) => resolveCompanyActorUserId(client, companyId),
  });

  return {
    async resolveTrustedCustomer(input) {
      const companyId = input.companyId.trim();
      if (!companyId) {
        return { status: "invalid_sender", customerId: null, trustedCustomerName: null };
      }

      const actorUserId = await resolveCompanyActorUserId(client, companyId);
      if (!actorUserId) {
        return { status: "unknown", customerId: null, trustedCustomerName: null };
      }

      const resolved = await resolveTrustedChannelCustomer({
        companyId,
        channelKey: input.channelKey,
        senderExternalId: input.senderExternalId,
        findByPhone: async (phone) => {
          const result = await customerService.findCustomer({
            companyId,
            userId: actorUserId,
            lookupBy: "phone",
            lookupValue: phone,
          });
          if (result.status === "found" && result.customer) {
            return {
              status: "found",
              customer: {
                id: result.customer.id,
                name: result.customer.name,
                phone: result.customer.phone,
              },
            };
          }
          if (result.status === "duplicate") {
            return { status: "duplicate", count: result.count };
          }
          return { status: "not_found" };
        },
      });

      if (resolved.status === "known") {
        return {
          status: "known",
          customerId: resolved.customerId,
          trustedCustomerName: resolved.trustedCustomerName || null,
        };
      }
      if (resolved.status === "ambiguous") {
        return { status: "ambiguous", customerId: null, trustedCustomerName: null };
      }
      if (resolved.status === "unsupported_channel") {
        return { status: "unsupported_channel", customerId: null, trustedCustomerName: null };
      }
      if (resolved.status === "invalid_sender") {
        return { status: "invalid_sender", customerId: null, trustedCustomerName: null };
      }
      return { status: "unknown", customerId: null, trustedCustomerName: null };
    },
  };
}
