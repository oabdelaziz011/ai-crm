import type { SupabaseClient } from "@supabase/supabase-js";
import {
  formatEmptyAvailabilityMessage,
  normalizeDaysAhead,
  scanAvailableDates,
  TimezoneResolver,
  type AvailabilityScanEnginePort,
} from "@workspace/scheduling-engine";
import { createSchedulingServices } from "@/lib/scheduling";
import { supabase as defaultClient } from "@/lib/supabase";
import type { LookupOptionRow } from "../types";
import type { AvailableDateRecord, AvailableDatesLookupContext } from "./available-date-types";
import {
  availableDateRecordToLookupRow,
  formatAvailableDateLabel,
} from "./map-available-dates";

function readRequiredContext(
  filters: Record<string, unknown> | undefined,
): AvailableDatesLookupContext | null {
  if (!filters) return null;
  const service_id = String(filters.service_id ?? "").trim();
  const resource_id = String(filters.resource_id ?? "").trim();
  if (!service_id || !resource_id) return null;
  const daysAheadRaw = filters.days_ahead ?? filters.daysAhead;
  const daysAhead =
    daysAheadRaw == null || daysAheadRaw === ""
      ? undefined
      : normalizeDaysAhead(daysAheadRaw);
  return { service_id, resource_id, daysAhead };
}

function createScanEngine(scheduling: ReturnType<typeof createSchedulingServices>): AvailabilityScanEnginePort {
  return {
    resolveAvailability: (...args) => scheduling.availabilityEngine.resolveAvailability(...args),
    getAvailableSlots: (...args) => scheduling.slotGenerationEngine.getAvailableSlots(...args),
  };
}

export async function fetchAvailableDatesLookupOptions(
  companyId: string,
  filters: Record<string, unknown> | undefined,
  displayField: string,
  valueField: string,
  client: SupabaseClient = defaultClient,
): Promise<LookupOptionRow[]> {
  const context = readRequiredContext(filters);
  if (!context) return [];

  const scheduling = createSchedulingServices(client);
  const referenceNow = new Date();
  const rules = await scheduling.bookingRules.get(companyId);
  const timezone = TimezoneResolver.resolveEffectiveTimezone(null, null, rules?.timezone ?? "UTC");
  const startDate = TimezoneResolver.localDateForInstant(referenceNow, timezone);

  const [{ data: resource }, serviceDuration] = await Promise.all([
    client
      .from("scheduling_resources")
      .select("name, metadata")
      .eq("company_id", companyId)
      .eq("id", context.resource_id)
      .maybeSingle(),
    scheduling.serviceCatalog.getById(context.service_id, companyId).catch(() => null),
  ]);

  const resourceName = String(resource?.name ?? context.resource_id);
  const capacityRaw = (resource?.metadata as Record<string, unknown> | null)?.capacity;
  const capacity =
    typeof capacityRaw === "number" && Number.isFinite(capacityRaw) && capacityRaw > 0
      ? Math.floor(capacityRaw)
      : 1;

  const scanResult = await scanAvailableDates(createScanEngine(scheduling), {
    companyId,
    serviceId: context.service_id,
    durationMinutes: Number(serviceDuration?.duration_minutes ?? 30),
    resources: [{
      resourceId: context.resource_id,
      resourceName,
      capacity,
    }],
    startDate,
    daysAhead: context.daysAhead,
    timezone,
    maxBookingWindowDays: rules?.max_booking_window_days ?? 90,
    referenceNow,
  });

  const records: AvailableDateRecord[] = scanResult.availableDates.map((date) => ({
    date,
    display_date: formatAvailableDateLabel(date, timezone),
    service_id: context.service_id,
    resource_id: context.resource_id,
    timezone,
  }));

  return records.map((record) =>
    availableDateRecordToLookupRow(record, displayField, valueField),
  );
}

export function readAvailableDatesEmptyMessage(
  filters: Record<string, unknown> | undefined,
  maxBookingWindowDays = 90,
): string {
  const daysAheadRaw = filters?.days_ahead ?? filters?.daysAhead;
  const searchedWindow = normalizeDaysAhead(daysAheadRaw, maxBookingWindowDays);
  return formatEmptyAvailabilityMessage(searchedWindow);
}

export function availableDatesLookupQueryKey(
  companyId: string | null,
  filters: Record<string, unknown> | null | undefined,
  displayField: string | null,
  valueField: string | null,
) {
  return [
    "available-dates-lookup",
    companyId,
    filters?.service_id ?? null,
    filters?.resource_id ?? null,
    filters?.days_ahead ?? filters?.daysAhead ?? null,
    displayField,
    valueField,
  ] as const;
}
