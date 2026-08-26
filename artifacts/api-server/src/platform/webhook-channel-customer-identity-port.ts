import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createSupabaseCustomerServicePort,
  resolveCompanyActorUserId,
} from "@workspace/automation-platform";
import {
  customerPhoneMatchesWhatsAppSender,
  resolveTrustedChannelCustomer,
} from "@workspace/ai-tool-router";
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

  async function getCustomerById(input: {
    companyId: string;
    customerId: string;
  }): Promise<{ id: string; name: string | null; phone: string | null } | null> {
    const companyId = input.companyId.trim();
    const customerId = input.customerId.trim();
    if (!companyId || !customerId) return null;
    const { data, error } = await client
      .from("customers")
      .select("id, name, phone")
      .eq("company_id", companyId)
      .eq("id", customerId)
      .maybeSingle();
    if (error || !data?.id) return null;
    return {
      id: String(data.id),
      name: typeof data.name === "string" ? data.name : null,
      phone: typeof data.phone === "string" ? data.phone : null,
    };
  }

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

    getCustomerById,

    async customerMatchesWhatsAppSender(input) {
      const row = await getCustomerById({
        companyId: input.companyId,
        customerId: input.customerId,
      });
      if (!row) return { matches: false, name: null };
      const matches = customerPhoneMatchesWhatsAppSender(row.phone, input.senderExternalId);
      return {
        matches,
        name: typeof row.name === "string" && row.name.trim() ? row.name.trim() : null,
      };
    },
  };
}
