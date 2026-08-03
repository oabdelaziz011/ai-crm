import type { SupabaseClient } from "@supabase/supabase-js";

import type {

  CustomerAddressReadPort,

  TaskReadPort,

} from "@workspace/application-layer";

import type { LoginAppPortContext } from "./customer-read-port-adapter.js";



/** Address adapter — addresses remain customer-scoped until universal address table ships. */

export function createLoginAppCustomerAddressReadPort(

  _client: SupabaseClient,

  ctx: LoginAppPortContext,

): CustomerAddressReadPort {

  return {

    async listForCustomer(tenantId, _customerId) {

      if (tenantId !== ctx.companyId || !ctx.hasPermission("customers.view")) return [];

      return [];

    },

  };

}



export function createLoginAppTaskReadPort(client: SupabaseClient, ctx: LoginAppPortContext): TaskReadPort {

  return {

    async listForEntity(tenantId, entityType, entityId, limit = 25) {

      if (tenantId !== ctx.companyId || !(ctx.isSuperAdmin || ctx.hasPermission("tasks.read"))) return [];



      const { data, error } = await client

        .from("tasks")

        .select("id, title, assignee_id, due_at, status, created_at, completed_at")

        .eq("company_id", tenantId)

        .eq("entity_type", entityType)

        .eq("entity_id", entityId)

        .order("created_at", { ascending: false })

        .limit(limit);



      if (error) return [];



      return (data ?? []).map((row) =>
        Object.freeze({
          id: String(row.id),
          title: String(row.title),
          assigneeId: String(row.assignee_id ?? ""),
          dueAt: row.due_at ? String(row.due_at) : undefined,
          status: String(row.status ?? "open"),
          createdAt: String(row.created_at),
          completedAt: row.completed_at ? String(row.completed_at) : undefined,
        }),
      );
    },
  };
}

