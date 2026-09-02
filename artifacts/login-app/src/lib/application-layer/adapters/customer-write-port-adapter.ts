import type { SupabaseClient } from "@supabase/supabase-js";
import type { CustomerWritePort, CustomerReadModel } from "@workspace/application-layer";
import {
  buildCustomerPhoneIdentityColumns,
  isImportPhoneWritable,
  resolveImportPhoneIdentity,
} from "@workspace/ai-tool-router";
import { SupabaseCustomerRepository } from "@/lib/crm/supabase-customer-repository";
import type { LoginAppPortContext } from "./customer-read-port-adapter.js";

function assertWritablePhoneIdentity(input: {
  phone: string | null | undefined;
  region?: string | null;
  source?: "explicit" | "import";
}) {
  const preview = resolveImportPhoneIdentity({
    phone: input.phone,
    rowRegion: input.region,
    source: input.source ?? "explicit",
  });
  if (!isImportPhoneWritable(preview) || !preview.identity) {
    if (preview.code === "phone_region_required") {
      throw new Error(
        "PHONE_REGION_REQUIRED: Provide an ISO-2 region for local phone numbers, or use E.164 (+...).",
      );
    }
    if (preview.code === "ambiguous_phone") {
      throw new Error("AMBIGUOUS_PHONE: Phone number is ambiguous; provide ISO-2 region or E.164.");
    }
    throw new Error("INVALID_PHONE: Enter a valid phone number in E.164 or local+region form.");
  }
  return preview;
}

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

      const phoneIdentity =
        input.phoneIdentity ??
        assertWritablePhoneIdentity({
          phone: input.phone ?? null,
          region: input.phoneRegion ?? null,
          source: "explicit",
        }).identity!;

      // Empty phone: identity may be cleared columns from assertWritable (ok).
      if (input.phone?.trim() && !phoneIdentity.phone_e164 && phoneIdentity.phone_region_source === "unresolved") {
        throw new Error("PHONE_IDENTITY_UNRESOLVED: Cannot create customer with unresolved phone identity.");
      }

      const record = await repository.createCustomer({
        userId: ctx.actorUserId,
        companyId: input.tenantId,
        name: input.displayName,
        email: input.email,
        phone: input.phone,
        phoneIdentity,
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
      const phoneIdentityFromPatch =
        patch.phoneIdentity && typeof patch.phoneIdentity === "object"
          ? (patch.phoneIdentity as ReturnType<typeof buildCustomerPhoneIdentityColumns>)
          : null;
      const phoneRegion =
        typeof patch.phoneRegion === "string" ? patch.phoneRegion : null;

      for (const [field, value] of Object.entries(patch)) {
        if (value == null) continue;
        if (field === "phoneIdentity" || field === "phoneRegion") continue;
        // Application-layer CustomerReadModel uses displayName; CRM repo column is name.
        const repoField = field === "displayName" ? "name" : field;
        let phoneIdentity =
          repoField === "phone"
            ? phoneIdentityFromPatch ??
              assertWritablePhoneIdentity({
                phone: String(value),
                region: phoneRegion,
                source: "explicit",
              }).identity!
            : undefined;
        latest = await repository.updateCustomer({
          companyId: tenantId,
          customerId,
          userId: ctx.actorUserId,
          field: repoField,
          value: String(value),
          phoneIdentity,
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
