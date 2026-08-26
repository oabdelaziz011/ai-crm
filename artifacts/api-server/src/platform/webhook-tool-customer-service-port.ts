import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createSupabaseCustomerServicePort,
  resolveCompanyActorUserId,
} from "@workspace/automation-platform";
import type { ToolCustomerServicePort } from "@workspace/ai-tool-router";

export function createWebhookToolCustomerServicePort(client: SupabaseClient): ToolCustomerServicePort {
  const customerService = createSupabaseCustomerServicePort(client, {
    resolveActorUserIdForCompany: (companyId) => resolveCompanyActorUserId(client, companyId),
  });

  return {
    async findCustomer(input) {
      const result = await customerService.findCustomer(input);
      if (result.status === "found" && result.customer) {
        return {
          status: "found",
          count: 1,
          customer: {
            id: result.customer.id,
            name: result.customer.name,
            email: result.customer.email,
            phone: result.customer.phone,
          },
        };
      }
      if (result.status === "duplicate") {
        return { status: "duplicate", count: result.count };
      }
      return { status: "not_found", count: 0 };
    },
    async createCustomer(input) {
      const result = await customerService.createCustomer(input);
      return {
        customer: {
          id: result.customer.id,
          name: result.customer.name,
          email: result.customer.email,
          phone: result.customer.phone,
        },
      };
    },
    async updateCustomerName(input) {
      const result = await customerService.updateCustomer({
        companyId: input.companyId,
        userId: input.userId,
        customerId: input.customerId,
        field: "name",
        value: input.name,
      });
      return {
        customer: {
          id: result.customer.id,
          name: result.customer.name,
          email: result.customer.email,
          phone: result.customer.phone,
        },
      };
    },
    async linkConversationCustomer(input) {
      if (!input.conversationId?.trim() || !input.customerId?.trim()) return;
      const conversationId = input.conversationId.trim();
      const customerId = input.customerId.trim();

      await client
        .from("conversations")
        .update({ customer_id: customerId })
        .eq("id", conversationId)
        .is("customer_id", null);

      if (!input.stampTrustedIdentity) return;

      const { data: row, error: readError } = await client
        .from("conversations")
        .select("metadata")
        .eq("id", conversationId)
        .maybeSingle();
      if (readError) throw readError;

      const existing =
        row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? { ...(row.metadata as Record<string, unknown>) }
          : {};
      const status = existing.channelIdentityStatus;
      // Never overwrite fail-closed ambiguous / conflict stamps.
      if (status === "ambiguous" || status === "conflict_stale_bind") return;

      const name =
        typeof input.customerName === "string" && input.customerName.trim()
          ? input.customerName.trim()
          : null;
      const nextMetadata: Record<string, unknown> = {
        ...existing,
        trustedChannelCustomerId: customerId,
        channelIdentityStatus: "known_via_create_customer",
        ...(name ? { trustedCustomerName: name } : {}),
      };
      const { error: writeError } = await client
        .from("conversations")
        .update({ metadata: nextMetadata })
        .eq("id", conversationId);
      if (writeError) throw writeError;
    },
    async getConversationWhatsAppSender(input) {
      if (!input.conversationId?.trim()) return null;
      const { data, error } = await client
        .from("conversations")
        .select("metadata, external_thread_id")
        .eq("id", input.conversationId.trim())
        .maybeSingle();
      if (error) throw error;
      const meta =
        data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
          ? (data.metadata as Record<string, unknown>)
          : {};
      const fromMeta = [meta.senderExternalId, meta.sender_external_id, meta.externalThreadId, meta.external_thread_id]
        .find((value) => typeof value === "string" && value.trim());
      if (typeof fromMeta === "string" && fromMeta.trim()) return fromMeta.trim();
      const thread =
        typeof data?.external_thread_id === "string" ? data.external_thread_id.trim() : "";
      return thread || null;
    },
  };
}
