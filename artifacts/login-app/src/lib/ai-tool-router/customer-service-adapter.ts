import type { ToolCustomerServicePort } from "@workspace/ai-tool-router";
import { createSupabaseCustomerServicePort } from "@/lib/crm/supabase-customer-service-adapter";
import { supabase } from "@/lib/supabase";

export function createToolCustomerServicePort(getActorUserId: () => string | null): ToolCustomerServicePort {
  const customerService = createSupabaseCustomerServicePort(supabase, getActorUserId);

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
  };
}
