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
      await client
        .from("conversations")
        .update({ customer_id: input.customerId })
        .eq("id", input.conversationId)
        .is("customer_id", null);
    },
  };
}
