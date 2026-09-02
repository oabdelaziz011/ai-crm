import type { ToolCustomerServicePort } from "@workspace/ai-tool-router";
import { createLoginAppApplicationPorts } from "@/lib/application-layer/create-login-app-application-ports";
import { supabase } from "@/lib/supabase";
import { pickCanonicalCustomerIdFromPhoneMatches } from "./customer-phone-collapse";

async function bookingCountsForCustomers(
  companyId: string,
  customerIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const id of customerIds) counts.set(id, 0);
  if (customerIds.length === 0) return counts;

  const { data, error } = await supabase
    .from("scheduling_bookings")
    .select("customer_id")
    .eq("company_id", companyId)
    .in("customer_id", customerIds)
    .is("deleted_at", null)
    .limit(500);
  if (error) throw new Error(error.message);

  for (const row of data ?? []) {
    const id = String(row.customer_id ?? "");
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

export function createToolCustomerServicePort(
  getActorUserId: () => string | null,
  companyId: () => string | null,
  hasPermission: (code: string) => boolean = () => true,
  isSuperAdmin = false,
): ToolCustomerServicePort {
  return {
    async findCustomer(input) {
      const tenantId = companyId() ?? input.companyId;
      const actorId = getActorUserId() ?? input.userId;
      const ports = createLoginAppApplicationPorts(
        {
          companyId: tenantId,
          actorUserId: actorId,
          isSuperAdmin,
          hasPermission,
        },
        supabase,
      );

      const byPhoneE164 =
        input.lookupBy === "phone_e164"
          ? await (async () => {
              const { data, error } = await supabase
                .from("customers")
                .select("id, name, email, phone")
                .eq("company_id", tenantId)
                .eq("phone_e164", input.lookupValue.trim())
                .limit(5);
              if (error) throw new Error(error.message);
              return (data ?? []).map((row) => ({
                id: String(row.id),
                displayName: typeof row.name === "string" ? row.name : "",
                email: typeof row.email === "string" ? row.email : null,
                phone: typeof row.phone === "string" ? row.phone : null,
              }));
            })()
          : [];
      const byPhone =
        input.lookupBy === "phone"
          ? await ports.customerRead.search(tenantId, input.lookupValue, 5)
          : [];
      const byEmail =
        input.lookupBy === "email"
          ? await ports.customerRead.search(tenantId, input.lookupValue, 5)
          : [];
      const matches = [...byPhoneE164, ...byPhone, ...byEmail].filter(
        (c, i, arr) => arr.findIndex((x) => x.id === c.id) === i,
      );

      if (matches.length === 1) {
        const c = matches[0]!;
        return {
          status: "found",
          count: 1,
          customer: {
            id: c.id,
            name: c.displayName,
            email: c.email ?? null,
            phone: c.phone ?? null,
          },
        };
      }

      if (matches.length > 1 && input.lookupBy === "phone") {
        const counts = await bookingCountsForCustomers(
          tenantId,
          matches.map((m) => m.id),
        );
        const { data: identityRows } = await supabase
          .from("customers")
          .select("id, phone_e164")
          .eq("company_id", tenantId)
          .in(
            "id",
            matches.map((m) => m.id),
          );
        const e164ById = new Map(
          (identityRows ?? []).map((row) => [
            String(row.id),
            typeof row.phone_e164 === "string" ? row.phone_e164 : null,
          ]),
        );
        const canonicalId = pickCanonicalCustomerIdFromPhoneMatches(
          matches.map((m) => ({
            id: m.id,
            phone: m.phone,
            phoneE164: e164ById.get(m.id) ?? null,
          })),
          counts,
        );
        const canonical = matches.find((m) => m.id === canonicalId);
        if (canonical) {
          return {
            status: "found",
            count: 1,
            customer: {
              id: canonical.id,
              name: canonical.displayName,
              email: canonical.email ?? null,
              phone: canonical.phone ?? null,
            },
          };
        }
        return { status: "duplicate", count: matches.length };
      }

      if (matches.length > 1) {
        return { status: "duplicate", count: matches.length };
      }
      return { status: "not_found", count: 0 };
    },

    async createCustomer(input) {
      const tenantId = companyId() ?? input.companyId;
      const actorId = getActorUserId() ?? input.userId;
      const ports = createLoginAppApplicationPorts(
        {
          companyId: tenantId,
          actorUserId: actorId,
          isSuperAdmin,
          hasPermission,
        },
        supabase,
      );

      const created = await ports.customerWrite.create({
        tenantId,
        displayName: input.name,
        email: input.email ?? undefined,
        phone: input.phone,
        phoneIdentity: input.phoneIdentity,
      });

      return {
        customer: {
          id: created.id,
          name: created.displayName,
          email: created.email ?? null,
          phone: created.phone ?? null,
        },
      };
    },

    async updateCustomerName(input) {
      const tenantId = companyId() ?? input.companyId;
      const actorId = getActorUserId() ?? input.userId;
      const ports = createLoginAppApplicationPorts(
        {
          companyId: tenantId,
          actorUserId: actorId,
          isSuperAdmin,
          hasPermission,
        },
        supabase,
      );

      const updated = await ports.customerWrite.update(tenantId, input.customerId, {
        displayName: input.name,
      });

      return {
        customer: {
          id: updated.id,
          name: updated.displayName,
          email: updated.email ?? null,
          phone: updated.phone ?? null,
        },
      };
    },

    async linkConversationCustomer(input) {
      const conversationId = input.conversationId?.trim();
      const customerId = input.customerId?.trim();
      if (!conversationId || !customerId) return;
      await supabase
        .from("conversations")
        .update({ customer_id: customerId })
        .eq("id", conversationId)
        .is("customer_id", null);
    },
  };
}
