/**
 * Customer-scoped audit History repository.
 * Queries audit_logs by company_id + customer linkage — never phone / last-9 / global latest-N.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CustomerAuditModuleAccess } from "./workspace-feature-access";
import { auditEntityAllowedByModuleAccess } from "./workspace-feature-access";
import {
  assertCustomerAuditHistoryQuery,
  auditLogBelongsToCustomer,
  CUSTOMER_AUDIT_HISTORY_PAGE_SIZE,
  customerAuditItemMatchesFilters,
  mapAuditLogToCustomerHistoryItem,
  paginateCustomerAuditHistoryItems,
  resolveCustomerAuditHistoryDateRange,
  type CustomerAuditHistoryQuery,
  type CustomerAuditHistoryResult,
  type RawAuditLogRow,
} from "./customer-audit-history";

const AUDIT_COLUMNS =
  "id, user_id, company_id, action, entity, entity_id, metadata, created_at" as const;

const RELATED_ENTITY_KEYS = [
  "scheduling_bookings",
  "bookings",
  "invoices",
  "support_tickets",
] as const;

async function loadRelatedEntityKeys(
  client: SupabaseClient,
  companyId: string,
  customerId: string,
  moduleAccess?: CustomerAuditModuleAccess,
): Promise<Set<string>> {
  const keys = new Set<string>();

  const loads: Array<PromiseLike<void>> = [];

  if (!moduleAccess || moduleAccess.bookings) {
    loads.push(
      client
        .from("scheduling_bookings")
        .select("id")
        .eq("company_id", companyId)
        .eq("customer_id", customerId)
        .limit(500)
        .then(({ data }) => {
          for (const row of data ?? []) {
            keys.add(`scheduling_bookings:${row.id}`);
          }
        }),
      client
        .from("bookings")
        .select("id")
        .eq("company_id", companyId)
        .eq("customer_id", customerId)
        .limit(500)
        .then(({ data }) => {
          for (const row of data ?? []) {
            keys.add(`bookings:${row.id}`);
          }
        }),
    );
  }

  if (!moduleAccess || moduleAccess.finance) {
    loads.push(
      client
        .from("invoices")
        .select("id")
        .eq("company_id", companyId)
        .eq("customer_id", customerId)
        .limit(500)
        .then(({ data }) => {
          for (const row of data ?? []) {
            keys.add(`invoices:${row.id}`);
          }
        }),
    );
  }

  if (!moduleAccess || moduleAccess.ticketing) {
    loads.push(
      client
        .from("support_tickets")
        .select("id")
        .eq("company_id", companyId)
        .eq("customer_id", customerId)
        .limit(500)
        .then(({ data }) => {
          for (const row of data ?? []) {
            keys.add(`support_tickets:${row.id}`);
          }
        }),
    );
  }

  await Promise.all(loads);
  return keys;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export class CustomerAuditHistoryRepository {
  constructor(private readonly client: SupabaseClient) {}

  async list(input: CustomerAuditHistoryQuery): Promise<CustomerAuditHistoryResult> {
    assertCustomerAuditHistoryQuery(input);
    const companyId = input.companyId.trim();
    const customerId = input.customerId.trim();
    const page = Math.max(1, input.page ?? 1);
    const pageSize = Math.min(
      100,
      Math.max(1, input.pageSize ?? CUSTOMER_AUDIT_HISTORY_PAGE_SIZE),
    );
    const { from, to } = resolveCustomerAuditHistoryDateRange({
      period: input.period,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
    });

    // Ownership proof: customer must belong to this company.
    const { data: customerRow, error: customerError } = await this.client
      .from("customers")
      .select("id, company_id")
      .eq("id", customerId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (customerError) throw new Error(customerError.message);
    if (!customerRow) {
      return { items: [], total: 0, page, pageSize };
    }

    const relatedKeys = await loadRelatedEntityKeys(
      this.client,
      companyId,
      customerId,
      input.moduleAccess,
    );
    const relatedByEntity = new Map<string, string[]>();
    for (const key of relatedKeys) {
      const [entity, id] = key.split(":");
      if (!entity || !id) continue;
      const list = relatedByEntity.get(entity) ?? [];
      list.push(id);
      relatedByEntity.set(entity, list);
    }

    const rowsById = new Map<string, RawAuditLogRow>();

    const applyDate = <T extends { gte: Function; lte: Function }>(q: T): T => {
      let next = q;
      if (from) next = next.gte("created_at", from) as T;
      if (to) next = next.lte("created_at", to) as T;
      return next;
    };

    // 1) Direct customer entity rows (company match OR legacy null-company self rows).
    {
      let q = this.client
        .from("audit_logs")
        .select(AUDIT_COLUMNS)
        .eq("entity", "customers")
        .eq("entity_id", customerId)
        .order("created_at", { ascending: false })
        .limit(500);
      q = applyDate(q);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      for (const row of (data ?? []) as RawAuditLogRow[]) {
        if (
          auditLogBelongsToCustomer({
            row,
            companyId,
            customerId,
            relatedEntityIds: relatedKeys,
          })
        ) {
          rowsById.set(row.id, row);
        }
      }
    }

    // 2) Metadata customer_id within company.
    {
      let q = this.client
        .from("audit_logs")
        .select(AUDIT_COLUMNS)
        .eq("company_id", companyId)
        .filter("metadata->>customer_id", "eq", customerId)
        .order("created_at", { ascending: false })
        .limit(500);
      q = applyDate(q);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      for (const row of (data ?? []) as RawAuditLogRow[]) {
        if (
          input.moduleAccess &&
          !auditEntityAllowedByModuleAccess(row.entity, input.moduleAccess)
        ) {
          continue;
        }
        rowsById.set(row.id, row);
      }
    }

    // 3) Related entity audits (company-scoped entity ids from customer-owned rows).
    for (const entity of RELATED_ENTITY_KEYS) {
      if (input.moduleAccess && !auditEntityAllowedByModuleAccess(entity, input.moduleAccess)) {
        continue;
      }
      const ids = relatedByEntity.get(entity) ?? [];
      if (ids.length === 0) continue;
      for (const idChunk of chunk(ids, 100)) {
        let q = this.client
          .from("audit_logs")
          .select(AUDIT_COLUMNS)
          .eq("entity", entity)
          .in("entity_id", idChunk)
          .order("created_at", { ascending: false })
          .limit(500);
        // Prefer company match; also allow null company on related rows if entity_id is owned.
        q = applyDate(q);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        for (const row of (data ?? []) as RawAuditLogRow[]) {
          if (
            auditLogBelongsToCustomer({
              row,
              companyId,
              customerId,
              relatedEntityIds: relatedKeys,
            })
          ) {
            rowsById.set(row.id, row);
          }
        }
      }
    }

    const actorIds = [
      ...new Set(
        [...rowsById.values()]
          .map((r) => r.user_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const actorById = new Map<string, { full_name: string | null; email: string | null }>();
    if (actorIds.length > 0) {
      const { data: profiles, error: profilesError } = await this.client
        .from("profiles")
        .select("id, full_name, email, company_id")
        .in("id", actorIds);
      if (profilesError) throw new Error(profilesError.message);
      for (const profile of profiles ?? []) {
        // Prefer same-company actors; still show name if profile has no company (legacy).
        if (
          profile.company_id == null ||
          profile.company_id === companyId
        ) {
          actorById.set(profile.id, {
            full_name: profile.full_name,
            email: profile.email,
          });
        }
      }
    }

    let items = [...rowsById.values()].map((row) => {
      const actor = row.user_id ? actorById.get(row.user_id) : undefined;
      return mapAuditLogToCustomerHistoryItem({
        row,
        customerId,
        actorName: actor?.full_name ?? null,
        actorEmail: actor?.email ?? null,
      });
    });

    items = items.filter((item) =>
      customerAuditItemMatchesFilters(item, {
        eventFilter: input.eventFilter,
        sourceFilter: input.sourceFilter,
        actorUserId: input.actorUserId,
      }),
    );

    if (input.moduleAccess) {
      items = items.filter((item) =>
        auditEntityAllowedByModuleAccess(item.entity, input.moduleAccess!),
      );
    }

    return paginateCustomerAuditHistoryItems(items, page, pageSize);
  }
}
