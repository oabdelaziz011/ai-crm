import type { SupabaseClient } from "@supabase/supabase-js";
import { wxRecordServiceResolution } from "@workspace/automation-platform";
import { supabase as defaultClient } from "@/lib/supabase";
import type { LookupOptionRow } from "../types";
import {
  CUSTOMER_SCHEDULING_BOOKINGS_LIMIT,
  RESCHEDULABLE_SCHEDULING_BOOKING_STATUSES,
  type CustomerSchedulingBookingRecord,
} from "./customer-scheduling-booking-types";
import {
  customerSchedulingBookingRecordToLookupRow,
  formatCustomerSchedulingBookingLabel,
} from "./map-customer-scheduling-bookings";

type SchedulingBookingRow = {
  id: unknown;
  customer_id: unknown;
  service_id: unknown;
  resource_id: unknown;
  start_at: unknown;
  end_at: unknown;
  timezone: unknown;
  status: unknown;
  confirmation_number: unknown;
};

function readRequiredCustomerId(filters: Record<string, unknown> | undefined): string | null {
  if (!filters) return null;
  const raw = filters.customer_id ?? filters.customerId;
  const customerId = String(raw ?? "").trim();
  return customerId || null;
}

function asId(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : String(value ?? "").trim();
}

async function loadDisplayNames(
  client: SupabaseClient,
  companyId: string,
  rows: SchedulingBookingRow[],
): Promise<{ services: Map<string, string>; resources: Map<string, string> }> {
  const serviceIds = [...new Set(rows.map((row) => asId(row.service_id)).filter(Boolean))];
  const resourceIds = [...new Set(rows.map((row) => asId(row.resource_id)).filter(Boolean))];

  const [servicesResult, resourcesResult] = await Promise.all([
    serviceIds.length === 0
      ? Promise.resolve({ data: [] as Array<{ id: string; name: unknown }>, error: null })
      : client
          .from("scheduling_services")
          .select("id, name")
          .eq("company_id", companyId)
          .in("id", serviceIds),
    resourceIds.length === 0
      ? Promise.resolve({ data: [] as Array<{ id: string; name: unknown }>, error: null })
      : client
          .from("scheduling_resources")
          .select("id, name")
          .eq("company_id", companyId)
          .in("id", resourceIds),
  ]);

  if (servicesResult.error) throw new Error(servicesResult.error.message);
  if (resourcesResult.error) throw new Error(resourcesResult.error.message);

  const services = new Map<string, string>();
  for (const row of servicesResult.data ?? []) {
    services.set(String(row.id), String(row.name ?? "").trim());
  }
  const resources = new Map<string, string>();
  for (const row of resourcesResult.data ?? []) {
    resources.set(String(row.id), String(row.name ?? "").trim());
  }
  return { services, resources };
}

function mapBookingRecord(
  row: SchedulingBookingRow,
  names: { services: Map<string, string>; resources: Map<string, string> },
  locale?: string | null,
): CustomerSchedulingBookingRecord | null {
  const id = asId(row.id);
  const customer_id = asId(row.customer_id);
  const service_id = asId(row.service_id);
  const resource_id = asId(row.resource_id);
  const start_at = asId(row.start_at);
  const end_at = asId(row.end_at);
  const timezone = asId(row.timezone) || "UTC";
  const status = asId(row.status);
  if (!id || !customer_id || !service_id || !resource_id || !start_at) return null;

  const confirmation =
    row.confirmation_number == null || String(row.confirmation_number).trim() === ""
      ? null
      : String(row.confirmation_number).trim();

  return {
    id,
    customer_id,
    service_id,
    resource_id,
    start_at,
    end_at,
    timezone,
    status,
    confirmation_number: confirmation,
    service_name: names.services.get(service_id) ?? "",
    resource_name: names.resources.get(resource_id) ?? "",
    display_label: formatCustomerSchedulingBookingLabel(start_at, timezone, locale),
  };
}

export async function fetchCustomerSchedulingBookingsLookupOptions(
  companyId: string,
  filters: Record<string, unknown> | undefined,
  displayField: string,
  valueField: string,
  client: SupabaseClient = defaultClient,
): Promise<LookupOptionRow[]> {
  const customerId = readRequiredCustomerId(filters);
  if (!customerId) return [];

  wxRecordServiceResolution("customerSchedulingBookings.lookup");
  const nowIso = new Date().toISOString();

  const { data, error } = await client
    .from("scheduling_bookings")
    .select(
      "id, customer_id, service_id, resource_id, start_at, end_at, timezone, status, confirmation_number",
    )
    .eq("company_id", companyId)
    .eq("customer_id", customerId)
    .in("status", [...RESCHEDULABLE_SCHEDULING_BOOKING_STATUSES])
    .is("deleted_at", null)
    .gte("start_at", nowIso)
    .order("start_at", { ascending: true })
    .limit(CUSTOMER_SCHEDULING_BOOKINGS_LIMIT);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as SchedulingBookingRow[];
  if (rows.length === 0) return [];

  const names = await loadDisplayNames(client, companyId, rows);
  const language = typeof filters?.language === "string" ? filters.language : null;

  return rows.flatMap((row) => {
    const record = mapBookingRecord(row, names, language);
    if (!record) return [];
    return [customerSchedulingBookingRecordToLookupRow(record, displayField, valueField)];
  });
}

export function customerSchedulingBookingsLookupQueryKey(
  companyId: string | null,
  filters: Record<string, unknown> | null | undefined,
  displayField: string | null,
  valueField: string | null,
) {
  return [
    "customer-scheduling-bookings-lookup",
    companyId,
    filters?.customer_id ?? filters?.customerId ?? null,
    displayField,
    valueField,
  ] as const;
}
