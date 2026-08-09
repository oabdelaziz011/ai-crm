import type { SupabaseClient } from "@supabase/supabase-js";
import { CustomerService } from "../customer/customer-service.js";
import { SupabaseCustomerRepository } from "./supabase-customer-repository.js";
import type { FindCustomerInput, FindCustomerResult } from "../types/find-customer-input.js";
import type { CreateCustomerInput, CreateCustomerResult, UpdateCustomerInput, UpdateCustomerResult } from "../types/customer-mutation-input.js";
import type { CustomerServicePort } from "../../ports/customer-service-port.js";
import {
  AUTOMATION_REQUEST_CACHE_NS,
  automationRequestGetOrLoad,
} from "../../debug/request-scope-memo-bridge.js";

export type SupabaseCustomerServicePortOptions = {
  getActorUserId?: () => string | null;
  resolveActorUserIdForCompany?: (companyId: string) => Promise<string | null>;
};

async function resolveUserId(
  input: { companyId: string; userId?: string },
  options: SupabaseCustomerServicePortOptions,
): Promise<string> {
  if (input.userId?.trim()) return input.userId.trim();
  const fromGetter = options.getActorUserId?.();
  if (fromGetter?.trim()) return fromGetter.trim();
  if (options.resolveActorUserIdForCompany) {
    const resolved = await options.resolveActorUserIdForCompany(input.companyId);
    if (resolved?.trim()) return resolved.trim();
  }
  throw new Error("Customer action requires an authenticated owner user.");
}

export function createSupabaseCustomerServicePort(
  client: SupabaseClient,
  options: SupabaseCustomerServicePortOptions = {},
): CustomerServicePort {
  const repository = new SupabaseCustomerRepository(client);
  const service = new CustomerService(repository);

  return {
    async findCustomer(input: FindCustomerInput): Promise<FindCustomerResult> {
      const userId = await resolveUserId(input, options);
      return service.findCustomer({ ...input, userId });
    },
    async createCustomer(input: CreateCustomerInput): Promise<CreateCustomerResult> {
      const userId = await resolveUserId(input, options);
      return service.createCustomer({ ...input, userId });
    },
    async resolveCustomerForLeadConversion(input: CreateCustomerInput) {
      const userId = await resolveUserId(input, options);
      return service.resolveCustomerForLeadConversion({ ...input, userId });
    },
    async updateCustomer(input: UpdateCustomerInput): Promise<UpdateCustomerResult> {
      const userId = await resolveUserId(input, options);
      return service.updateCustomer({ ...input, userId });
    },
  };
}

export async function resolveCompanyActorUserId(client: SupabaseClient, companyId: string): Promise<string | null> {
  return automationRequestGetOrLoad(
    AUTOMATION_REQUEST_CACHE_NS.companyActorUserId,
    companyId,
    async () => {
      const { data, error } = await client
        .from("profiles")
        .select("id, user_id")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) return null;
      const row = data as { id?: string; user_id?: string | null };
      return row.user_id?.trim() || row.id?.trim() || null;
    },
  );
}
