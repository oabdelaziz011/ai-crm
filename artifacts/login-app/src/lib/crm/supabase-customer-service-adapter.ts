import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DefaultCustomerServicePort,
  type CustomerServicePort,
  type FindCustomerInput,
  type FindCustomerResult,
} from "@workspace/automation-platform";
import { SupabaseCustomerRepository } from "./supabase-customer-repository";

export function createSupabaseCustomerServicePort(
  client: SupabaseClient,
  getActorUserId: () => string | null,
): CustomerServicePort {
  const repository = new SupabaseCustomerRepository(client);
  const delegate = new DefaultCustomerServicePort(repository);

  return {
    async findCustomer(input: FindCustomerInput): Promise<FindCustomerResult> {
      const userId = input.userId || getActorUserId();
      if (!userId) {
        throw new Error("Find customer requires an authenticated owner user.");
      }
      return delegate.findCustomer({ ...input, userId });
    },
  };
}
