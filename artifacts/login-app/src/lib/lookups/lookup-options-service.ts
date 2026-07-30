import type { SupabaseClient } from "@supabase/supabase-js";
import { deriveCustomerTags } from "@/lib/customer-workspace/customer-workspace-utils";
import { CUSTOMER_LIST_COLUMNS } from "@/lib/crm/crm-query-columns";
import { CRM_LIST_MAX_ROWS } from "@/lib/crm/crm-list-config";
import { createBranchServices } from "@/lib/company/branches";
import { createSchedulingServices } from "@/lib/scheduling";
import { supabase as defaultClient } from "@/lib/supabase";
import { fetchAvailableDatesLookupOptions } from "./available-dates/available-dates-lookup-service";
import { fetchAvailableSlotsLookupOptions } from "./available-slots/available-slots-lookup-service";
import { fetchRecommendedAppointmentsLookupOptions } from "./recommended-appointments/recommended-appointments-lookup-service";
import { mapRecordsToLookupRows } from "./map-lookup-rows";
import { getLookupEntityDefinition } from "./registry";
import type { ListLookupConfig, ListLookupFilters, LookupEntityId, LookupOptionRow } from "./types";

const STAFF_RESOURCE_TYPES = new Set(["doctor", "employee", "therapist"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function applyLookupFilters(
  records: Record<string, unknown>[],
  filters: ListLookupFilters | undefined,
): Record<string, unknown>[] {
  if (!filters) return records;
  return records.filter((record) =>
    Object.entries(filters).every(([key, expected]) => {
      if (expected == null || expected === "") return true;
      const actual = record[key];
      if (typeof expected === "boolean") return Boolean(actual) === expected;
      return String(actual ?? "") === String(expected);
    }),
  );
}

async function fetchCustomers(companyId: string, client: SupabaseClient): Promise<Record<string, unknown>[]> {
  const { data, error } = await client
    .from("customers")
    .select(CUSTOMER_LIST_COLUMNS)
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(CRM_LIST_MAX_ROWS);
  if (error) throw new Error(error.message);
  return (data ?? []) as Record<string, unknown>[];
}

async function fetchStaffProfiles(companyId: string, client: SupabaseClient): Promise<Record<string, unknown>[]> {
  const { data, error } = await client
    .from("profiles")
    .select("id, email, full_name, company_id, is_active")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("full_name", { ascending: true })
    .limit(CRM_LIST_MAX_ROWS);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    ...row,
    name: row.full_name ?? row.email ?? row.id,
  })) as Record<string, unknown>[];
}

async function fetchTags(companyId: string, client: SupabaseClient): Promise<Record<string, unknown>[]> {
  const customers = await fetchCustomers(companyId, client);
  const unique = new Set<string>();
  for (const customer of customers) {
    const tags = deriveCustomerTags(customer as never, 0, 0);
    for (const tag of tags) unique.add(tag);
  }
  return Array.from(unique)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ name }));
}

async function fetchEntityRecords(
  lookup: LookupEntityId,
  companyId: string,
  filters: ListLookupFilters | undefined,
  client: SupabaseClient,
  cachedCustomers?: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const scheduling = createSchedulingServices(client);
  const branches = createBranchServices(client);

  switch (lookup) {
    case "services": {
      const rows = await scheduling.serviceCatalog.list(companyId);
      return applyLookupFilters(rows as Record<string, unknown>[], filters);
    }
    case "resources": {
      const rows = await scheduling.resources.list(companyId);
      return applyLookupFilters(rows as Record<string, unknown>[], filters);
    }
    case "customers":
      return applyLookupFilters(
        cachedCustomers ?? await fetchCustomers(companyId, client),
        filters,
      );
    case "staff": {
      const resources = (await scheduling.resources.list(companyId)) as Record<string, unknown>[];
      const staffResources = resources.filter((row) =>
        STAFF_RESOURCE_TYPES.has(String(row.resource_type ?? "")),
      );
      if (staffResources.length > 0) {
        return applyLookupFilters(staffResources, filters);
      }
      return applyLookupFilters(await fetchStaffProfiles(companyId, client), filters);
    }
    case "branches": {
      const rows = await branches.branches.listWithStats(companyId, {
        status: typeof filters?.status === "string" ? (filters.status as never) : undefined,
      });
      return applyLookupFilters(rows as Record<string, unknown>[], filters);
    }
    case "rooms": {
      const rows = (await scheduling.resources.list(companyId)) as Record<string, unknown>[];
      const roomRows = rows.filter((row) => String(row.resource_type ?? "") === "room");
      return applyLookupFilters(roomRows, { ...filters, resource_type: "room" });
    }
    case "tags":
      return fetchTags(companyId, client);
    case "available_slots":
    case "recommended_appointments":
    case "available_dates":
      return [];
    default:
      throw new Error(`Unsupported lookup entity: ${lookup satisfies never}`);
  }
}

export type FetchLookupOptionsCache = {
  customers?: Record<string, unknown>[];
};

export async function fetchLookupOptions(
  companyId: string,
  config: ListLookupConfig,
  client: SupabaseClient = defaultClient,
  cache?: FetchLookupOptionsCache,
): Promise<LookupOptionRow[]> {
  getLookupEntityDefinition(config.lookup);

  if (config.lookup === "available_slots") {
    return fetchAvailableSlotsLookupOptions(
      companyId,
      config.filters,
      config.displayField,
      config.valueField,
      client,
    );
  }

  if (config.lookup === "recommended_appointments") {
    return fetchRecommendedAppointmentsLookupOptions(
      companyId,
      config.filters,
      config.displayField,
      config.valueField,
      client,
    );
  }

  if (config.lookup === "available_dates") {
    return fetchAvailableDatesLookupOptions(
      companyId,
      config.filters,
      config.displayField,
      config.valueField,
      client,
    );
  }

  const records = await fetchEntityRecords(
    config.lookup,
    companyId,
    config.filters,
    client,
    cache?.customers,
  );
  return mapRecordsToLookupRows(records.map((row) => asRecord(row) ?? {}), config);
}

export function lookupOptionsQueryKey(
  companyId: string | null,
  config: ListLookupConfig | null,
) {
  return ["lookup-options", companyId, config?.lookup ?? null, config?.displayField ?? null, config?.valueField ?? null, config?.filters ?? null] as const;
}
