import type { SupabaseClient } from "@supabase/supabase-js";
import type { CustomerReadPort, CustomerReadModel } from "@workspace/application-layer";
import {
  companyScopedPhoneE164Lookup,
  planCustomerPhoneSearch,
  queryLooksLikePhoneSearch,
} from "@workspace/ai-tool-router";
import { SupabaseCustomerRepository } from "@/lib/crm/supabase-customer-repository";
import { CustomerInvoiceRepository } from "@/lib/billing/repositories/customer-invoice-repository";

const CUSTOMER_SEARCH_COLUMNS =
  "id, name, email, phone, phone_e164, age, gender, notes, created_at, updated_at, company_id";

/**
 * Port context for product operations.
 * `hasPermission` here is the product authorization boundary and should be
 * RBAC ∩ company feature availability (see hasCompanyPermission /
 * useCompanyPermissionAuth). Do not pass raw RBAC-only hasPermission for
 * mapped product permissions.
 */
export type LoginAppPortContext = Readonly<{
  companyId: string;
  actorUserId: string;
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
}>;

function mapCustomer(row: Record<string, unknown>, tenantId: string, extras?: Partial<CustomerReadModel>): CustomerReadModel {
  return Object.freeze({
    id: String(row.id),
    tenantId,
    displayName: String(row.name),
    email: row.email == null ? undefined : String(row.email),
    phone: row.phone == null ? undefined : String(row.phone),
    isVip: extras?.isVip ?? false,
    outstandingBalanceCents: extras?.outstandingBalanceCents ?? 0,
    currentStatus: extras?.currentStatus ?? "Active",
    createdAt: String(row.created_at),
    notes: extras?.notes,
  });
}

async function computeOutstandingBalance(
  client: SupabaseClient,
  companyId: string,
  customerId: string,
): Promise<number> {
  const repo = new CustomerInvoiceRepository(client);
  const invoices = await repo.listByCompany(companyId, 200);
  return invoices
    .filter((inv) => inv.customerId === customerId)
    .reduce((sum, inv) => {
      const normalized = String(inv.status).toLowerCase();
      if (["paid", "completed", "settled", "cancelled"].includes(normalized)) return sum;
      return sum + Math.max(0, inv.totalCents - inv.paidCents);
    }, 0);
}

function mergeCustomerRows(
  preferred: Record<string, unknown>[],
  fallback: Record<string, unknown>[],
  limit: number,
): Record<string, unknown>[] {
  const byId = new Map<string, Record<string, unknown>>();
  for (const row of preferred) {
    const id = String(row.id ?? "");
    if (id) byId.set(id, row);
  }
  for (const row of fallback) {
    const id = String(row.id ?? "");
    if (id && !byId.has(id)) byId.set(id, row);
  }
  return [...byId.values()].slice(0, limit);
}

export function createLoginAppCustomerReadPort(
  client: SupabaseClient,
  ctx: LoginAppPortContext,
): CustomerReadPort {
  const repository = new SupabaseCustomerRepository(client);

  return {
    async getById(tenantId, customerId) {
      if (tenantId !== ctx.companyId || !ctx.hasPermission("customers.view")) return null;

      const { record } = await repository.findCustomersByField({
        companyId: tenantId,
        lookupBy: "customer_id",
        lookupValue: customerId,
      });
      if (!record) return null;

      const outstandingBalanceCents = ctx.hasPermission("invoices.view")
        ? await computeOutstandingBalance(client, tenantId, customerId)
        : 0;

      return mapCustomer(
        {
          id: record.id,
          name: record.name,
          email: record.email,
          phone: record.phone,
          created_at: record.createdAt,
        },
        tenantId,
        {
          outstandingBalanceCents,
          isVip: outstandingBalanceCents === 0 && Boolean(record.notes?.includes("VIP")),
          notes: record.notes ?? undefined,
        },
      );
    },

    async search(tenantId, query, limit = 10) {
      if (tenantId !== ctx.companyId || !ctx.hasPermission("customers.view")) return [];

      const q = query.trim();
      if (!q) return [];

      // Phase D3 — canonical company-scoped phone_e164 when safely resolvable.
      let e164Rows: Record<string, unknown>[] = [];
      if (queryLooksLikePhoneSearch(q)) {
        const plan = planCustomerPhoneSearch({ query: q, source: "explicit" });
        const scoped = companyScopedPhoneE164Lookup({
          companyId: tenantId,
          phoneE164: plan.phoneE164,
        });
        if (scoped) {
          const { data, error } = await client
            .from("customers")
            .select(CUSTOMER_SEARCH_COLUMNS)
            .eq("company_id", scoped.companyId)
            .eq("phone_e164", scoped.phoneE164)
            .limit(limit);
          if (error) throw new Error(error.message);
          e164Rows = (data ?? []) as Record<string, unknown>[];
        }
      }

      // Legacy tenant-scoped fallback (name / email / phone ilike). Always company-scoped.
      const { data, error } = await client
        .from("customers")
        .select(CUSTOMER_SEARCH_COLUMNS)
        .eq("company_id", tenantId)
        .or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`)
        .limit(limit);

      if (error) throw new Error(error.message);
      const legacyRows = (data ?? []) as Record<string, unknown>[];
      const merged = mergeCustomerRows(e164Rows, legacyRows, limit);
      return merged.map((row) => mapCustomer(row, tenantId));
    },
  };
}
