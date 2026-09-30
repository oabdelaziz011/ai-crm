import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createSupabaseCustomerServicePort,
  resolveCompanyActorUserId,
} from "@workspace/automation-platform";
import {
  customerEmailMatchesEmailSender,
  customerPhoneMatchesWhatsAppSender,
  normalizeMetaChannelExternalId,
  resolveOrCreateCustomerFromInbound,
} from "@workspace/ai-tool-router";
import type { ChannelCustomerIdentityPort } from "@workspace/channel-platform";

/**
 * Channel sender → company-scoped CRM identity.
 * WhatsApp / Email / SMS / Messenger / Instagram:
 * resolve existing customer, or auto-create once when unknown.
 * Never Customer360. Never global lookup. Never overwrite first-touch source.
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
  }): Promise<{
    id: string;
    name: string | null;
    phone: string | null;
    phoneE164: string | null;
    email: string | null;
  } | null> {
    const companyId = input.companyId.trim();
    const customerId = input.customerId.trim();
    if (!companyId || !customerId) return null;
    const { data, error } = await client
      .from("customers")
      .select("id, name, phone, phone_e164, email")
      .eq("company_id", companyId)
      .eq("id", customerId)
      .maybeSingle();
    if (error || !data?.id) return null;
    return {
      id: String(data.id),
      name: typeof data.name === "string" ? data.name : null,
      phone: typeof data.phone === "string" ? data.phone : null,
      phoneE164: typeof data.phone_e164 === "string" ? data.phone_e164 : null,
      email: typeof data.email === "string" ? data.email : null,
    };
  }

  async function findByChannelExternalId(input: {
    companyId: string;
    channelKey: "messenger" | "instagram";
    externalId: string;
  }): Promise<{
    status: "found" | "not_found" | "duplicate";
    customer?: {
      id: string;
      name: string;
      phone: string | null;
      phoneE164: string | null;
      email: string | null;
    } | null;
    count?: number;
  }> {
    const { data, error } = await client
      .from("customer_channel_identities")
      .select("customer_id")
      .eq("company_id", input.companyId)
      .eq("channel_key", input.channelKey)
      .eq("external_id", input.externalId)
      .limit(3);

    if (error) throw new Error(error.message);
    const ids = [...new Set((data ?? []).map((row) => String(row.customer_id ?? "").trim()).filter(Boolean))];
    if (ids.length === 0) return { status: "not_found" };
    if (ids.length > 1) return { status: "duplicate", count: ids.length };

    const row = await getCustomerById({
      companyId: input.companyId,
      customerId: ids[0]!,
    });
    if (!row) return { status: "not_found" };
    return {
      status: "found",
      customer: {
        id: row.id,
        name: row.name?.trim() || row.id,
        phone: row.phone,
        phoneE164: row.phoneE164,
        email: row.email,
      },
    };
  }

  async function linkChannelIdentity(input: {
    companyId: string;
    customerId: string;
    channelKey: "messenger" | "instagram";
    externalId: string;
  }): Promise<void> {
    const { error } = await client.from("customer_channel_identities").insert({
      company_id: input.companyId,
      customer_id: input.customerId,
      channel_key: input.channelKey,
      external_id: input.externalId,
    });
    if (error) throw new Error(error.message);
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

      const mapFindResult = (result: {
        status: string;
        customer?: {
          id: string;
          name: string;
          phone: string | null;
          phoneE164?: string | null;
          email?: string | null;
        } | null;
        count?: number;
      }) => {
        if (result.status === "found" && result.customer) {
          return {
            status: "found" as const,
            customer: {
              id: result.customer.id,
              name: result.customer.name,
              phone: result.customer.phone,
              phoneE164: result.customer.phoneE164 ?? null,
              email: result.customer.email ?? null,
            },
          };
        }
        if (result.status === "duplicate") {
          return { status: "duplicate" as const, count: result.count };
        }
        return { status: "not_found" as const };
      };

      const resolved = await resolveOrCreateCustomerFromInbound({
        companyId,
        channelKey: input.channelKey,
        senderExternalId: input.senderExternalId,
        senderDisplayName: input.senderDisplayName,
        findByPhone: async (phone) => {
          const result = await customerService.findCustomer({
            companyId,
            userId: actorUserId,
            lookupBy: "phone",
            lookupValue: phone,
          });
          return mapFindResult(result);
        },
        findByPhoneE164: async (phoneE164) => {
          const result = await customerService.findCustomer({
            companyId,
            userId: actorUserId,
            lookupBy: "phone_e164",
            lookupValue: phoneE164,
          });
          return mapFindResult(result);
        },
        findByEmail: async (email) => {
          const result = await customerService.findCustomer({
            companyId,
            userId: actorUserId,
            lookupBy: "email",
            lookupValue: email,
          });
          return mapFindResult(result);
        },
        findByChannelExternalId: async ({ channelKey, externalId }) => {
          const result = await findByChannelExternalId({
            companyId,
            channelKey,
            externalId,
          });
          return mapFindResult(result);
        },
        createCustomer: async (draft) => {
          const created = await customerService.createCustomer({
            companyId,
            userId: actorUserId,
            name: draft.name,
            email: draft.email ?? null,
            phone: draft.phone ?? null,
            source: draft.source,
            phoneIdentity: draft.phoneIdentity ?? null,
          });

          if (draft.channelIdentity) {
            try {
              await linkChannelIdentity({
                companyId,
                customerId: created.customer.id,
                channelKey: draft.channelIdentity.channelKey,
                externalId: draft.channelIdentity.externalId,
              });
            } catch (error) {
              // Unique race: keep throwing so resolve-or-create re-fetches the winner.
              // Non-unique link failure: remove the just-created row so a retry cannot
              // multiply phone-less Messenger/Instagram customers.
              const message = error instanceof Error ? error.message : String(error ?? "");
              const isUnique =
                /unique constraint|duplicate key|customer_channel_identities|idx_customer_channel_identities/i.test(
                  message,
                );
              if (!isUnique) {
                await client
                  .from("customers")
                  .delete()
                  .eq("id", created.customer.id)
                  .eq("company_id", companyId);
              }
              throw error;
            }
          }

          return {
            id: created.customer.id,
            name: created.customer.name,
          };
        },
        onError: (detail) => {
          console.error("[webhook-channel-customer-identity]", detail);
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
      const matches = customerPhoneMatchesWhatsAppSender(
        row.phone,
        input.senderExternalId,
        row.phoneE164,
      );
      return {
        matches,
        name: typeof row.name === "string" && row.name.trim() ? row.name.trim() : null,
      };
    },

    async customerMatchesEmailSender(input) {
      const row = await getCustomerById({
        companyId: input.companyId,
        customerId: input.customerId,
      });
      if (!row) return { matches: false, name: null };
      const matches = customerEmailMatchesEmailSender(row.email, input.senderExternalId);
      return {
        matches,
        name: typeof row.name === "string" && row.name.trim() ? row.name.trim() : null,
      };
    },

    async customerMatchesChannelExternalId(input) {
      const channelKey =
        input.channelKey === "messenger" || input.channelKey === "instagram"
          ? input.channelKey
          : null;
      if (!channelKey) return { matches: false, name: null };
      const externalId = normalizeMetaChannelExternalId(input.senderExternalId);
      if (!externalId) return { matches: false, name: null };

      const { data, error } = await client
        .from("customer_channel_identities")
        .select("customer_id")
        .eq("company_id", input.companyId)
        .eq("customer_id", input.customerId)
        .eq("channel_key", channelKey)
        .eq("external_id", externalId)
        .maybeSingle();

      if (error || !data?.customer_id) return { matches: false, name: null };
      const row = await getCustomerById({
        companyId: input.companyId,
        customerId: input.customerId,
      });
      return {
        matches: true,
        name: typeof row?.name === "string" && row.name.trim() ? row.name.trim() : null,
      };
    },
  };
}
