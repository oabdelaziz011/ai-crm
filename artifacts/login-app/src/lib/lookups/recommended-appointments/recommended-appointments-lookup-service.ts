import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeDaysAhead,
  recommendAppointments,
  TimezoneResolver,
  type AvailabilityScanEnginePort,
} from "@workspace/scheduling-engine";
import { wxRecordServiceResolution } from "@workspace/automation-platform";
import { createSchedulingServices } from "@/lib/scheduling";
import { supabase as defaultClient } from "@/lib/supabase";
import type { LookupOptionRow } from "../types";

type RecommendedAppointmentsLookupContext = {
  service_id: string;
  resource_id?: string;
  branch_id?: string;
  preferred_date?: string;
  preferred_time?: string;
  daysAhead?: number;
};

function readContext(
  filters: Record<string, unknown> | undefined,
): RecommendedAppointmentsLookupContext | null {
  if (!filters) return null;
  const service_id = String(filters.service_id ?? "").trim();
  if (!service_id) return null;

  const daysAheadRaw = filters.days_ahead ?? filters.daysAhead;
  return {
    service_id,
    resource_id: String(filters.resource_id ?? "").trim() || undefined,
    branch_id: String(filters.branch_id ?? "").trim() || undefined,
    preferred_date: String(filters.preferred_date ?? filters.date ?? "").trim() || undefined,
    preferred_time: String(filters.preferred_time ?? filters.time ?? "").trim() || undefined,
    daysAhead:
      daysAheadRaw == null || daysAheadRaw === ""
        ? undefined
        : normalizeDaysAhead(daysAheadRaw),
  };
}

function createScanEngine(scheduling: ReturnType<typeof createSchedulingServices>): AvailabilityScanEnginePort {
  return {
    resolveAvailability: (...args) => scheduling.availabilityEngine.resolveAvailability(...args),
    getAvailableSlots: (...args) => scheduling.slotGenerationEngine.getAvailableSlots(...args),
  };
}

export async function fetchRecommendedAppointmentsLookupOptions(
  companyId: string,
  filters: Record<string, unknown> | undefined,
  displayField: string,
  valueField: string,
  client: SupabaseClient = defaultClient,
): Promise<LookupOptionRow[]> {
  const context = readContext(filters);
  if (!context) return [];

  wxRecordServiceResolution("recommendedAppointments.lookup");
  const scheduling = createSchedulingServices(client);
  const referenceNow = new Date();
  const rules = await scheduling.bookingRules.get(companyId);
  const timezone = TimezoneResolver.resolveEffectiveTimezone(null, null, rules?.timezone ?? "UTC");
  const startDate = TimezoneResolver.localDateForInstant(referenceNow, timezone);

  const [{ data: resourceRows }, { data: branchRows }, service] = await Promise.all([
    client
      .from("resource_services")
      .select("resource_id, scheduling_resources!inner(id, name, metadata, branch_id, status, deleted_at, branches(id, name))")
      .eq("company_id", companyId)
      .eq("service_id", context.service_id)
      .is("deleted_at", null),
    client
      .from("branches")
      .select("id, name, is_primary")
      .eq("company_id", companyId)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("name"),
    scheduling.serviceCatalog.getById(context.service_id, companyId).catch(() => null),
  ]);

  const resources = (resourceRows ?? [])
    .map((row) => {
      const resource = row.scheduling_resources as {
        id?: string;
        name?: string;
        metadata?: Record<string, unknown> | null;
        branch_id?: string | null;
        status?: string;
        deleted_at?: string | null;
        branches?: { id?: string; name?: string } | null;
      } | null;
      if (!resource?.id || resource.status !== "active" || resource.deleted_at) return null;
      const capacityRaw = resource.metadata?.capacity;
      const capacity =
        typeof capacityRaw === "number" && Number.isFinite(capacityRaw) && capacityRaw > 0
          ? Math.floor(capacityRaw)
          : 1;
      return {
        resourceId: String(resource.id),
        resourceName: String(resource.name ?? resource.id),
        branchId: resource.branch_id ? String(resource.branch_id) : null,
        branchName: resource.branches?.name ? String(resource.branches.name) : null,
        capacity,
      };
    })
    .filter((resource): resource is NonNullable<typeof resource> => resource != null);

  const branches = (branchRows ?? []).map((row, index) => ({
    branchId: String(row.id),
    branchName: String(row.name),
    isPrimary: Boolean(row.is_primary),
    priority: row.is_primary ? 100 : Math.max(0, 50 - index),
  }));

  const result = await recommendAppointments(createScanEngine(scheduling), {
    companyId,
    serviceId: context.service_id,
    durationMinutes: Number(service?.duration_minutes ?? 30),
    resources,
    branches,
    startDate,
    daysAhead: context.daysAhead,
    timezone,
    maxBookingWindowDays: rules?.max_booking_window_days ?? 90,
    referenceNow,
    preferences: {
      resourceId: context.resource_id,
      branchId: context.branch_id,
      date: context.preferred_date,
      time: context.preferred_time,
    },
    limit: 10,
  });

  return result.recommendations.map((recommendation) => {
    const record = recommendation as unknown as Record<string, unknown>;
    const title =
      displayField === "display_label"
        ? `${recommendation.resourceName} · ${recommendation.date} ${recommendation.displayTime}`
        : String(record[displayField] ?? `${recommendation.resourceName} · ${recommendation.displayTime}`);
    const value =
      valueField === "slot_key"
        ? `${recommendation.resourceId}:${recommendation.date}:${recommendation.start}`
        : String(record[valueField] ?? `${recommendation.resourceId}:${recommendation.date}:${recommendation.start}`);

    return {
      id: `${recommendation.resourceId}-${recommendation.date}-${recommendation.start}`,
      title,
      description: `${recommendation.branchName ?? "No branch"} · score ${recommendation.score} · ${recommendation.reason}`,
      value,
      record: {
        ...(recommendation as unknown as Record<string, unknown>),
        display_label: title,
        slot_key: value,
      },
    };
  });
}
