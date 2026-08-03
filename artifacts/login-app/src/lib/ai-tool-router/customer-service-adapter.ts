import type { ToolCustomerServicePort } from "@workspace/ai-tool-router";
import { createLoginAppApplicationPorts } from "@/lib/application-layer/create-login-app-application-ports";
import { supabase } from "@/lib/supabase";

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

      const byPhone = input.lookupBy === "phone"
        ? await ports.customerRead.search(tenantId, input.lookupValue, 5)
        : [];
      const byEmail = input.lookupBy === "email"
        ? await ports.customerRead.search(tenantId, input.lookupValue, 5)
        : [];
      const matches = [...byPhone, ...byEmail].filter(
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
  };
}
