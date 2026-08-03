import type { SupabaseClient } from "@supabase/supabase-js";
import type { CustomerWritePort, CustomerReadModel } from "@workspace/application-layer";
import { SupabaseCustomerRepository } from "@/lib/crm/supabase-customer-repository";
import type { LoginAppPortContext } from "./customer-read-port-adapter.js";

export function createLoginAppCustomerWritePort(
  client: SupabaseClient,
  ctx: LoginAppPortContext,
): CustomerWritePort {
  const repository = new SupabaseCustomerRepository(client);

  return {
    async create(input) {
      if (input.tenantId !== ctx.companyId || !ctx.hasPermission("customers.create")) {
        throw new Error("Permission denied");
      }

      const record = await repository.createCustomer({
        userId: ctx.actorUserId,
        companyId: input.tenantId,
        name: input.displayName,
        email: input.email,
        phone: input.phone,
      });

      return Object.freeze({
        id: record.id,
        tenantId: input.tenantId,
        displayName: record.name,
        email: record.email ?? undefined,
        phone: record.phone ?? undefined,
        isVip: false,
        outstandingBalanceCents: 0,
        currentStatus: "Active",
        createdAt: record.createdAt,
      } satisfies CustomerReadModel);
    },

    async update(tenantId, customerId, patch) {
      if (tenantId !== ctx.companyId || !ctx.hasPermission("customers.edit")) {
        throw new Error("Permission denied");
      }

      let latest = null as Awaited<ReturnType<typeof repository.findCustomersByField>>["record"];
      for (const [field, value] of Object.entries(patch)) {
        if (value == null) continue;
        latest = await repository.updateCustomer({
          companyId: tenantId,
          customerId,
          userId: ctx.actorUserId,
          field,
          value: String(value),
        });
      }

      if (!latest) {
        const found = await repository.findCustomersByField({
          companyId: tenantId,
          lookupBy: "customer_id",
          lookupValue: customerId,
        });
        latest = found.record;
      }
      if (!latest) throw new Error("Customer not found");

      return Object.freeze({
        id: latest.id,
        tenantId,
        displayName: latest.name,
        email: latest.email ?? undefined,
        phone: latest.phone ?? undefined,
        isVip: false,
        outstandingBalanceCents: 0,
        currentStatus: "Active",
        createdAt: latest.createdAt,
      } satisfies CustomerReadModel);
    },
  };
}
