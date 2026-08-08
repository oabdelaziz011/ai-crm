import type { SupabaseClient } from "@supabase/supabase-js";
import { wxRecordServiceResolution } from "@workspace/automation-platform";
import { createSchedulingServices } from "@/lib/scheduling";
import { supabase as defaultClient } from "@/lib/supabase";
import type { LookupOptionRow } from "../types";
import type { AvailableSlotsLookupContext } from "./available-slot-types";
import {
  availableSlotRecordToLookupRow,
  mapResolvedSlotsToAvailableSlotRecords,
} from "./map-available-slots";

function readRequiredContext(
  filters: Record<string, unknown> | undefined,
): AvailableSlotsLookupContext | null {
  if (!filters) return null;
  const service_id = String(filters.service_id ?? "").trim();
  const resource_id = String(filters.resource_id ?? "").trim();
  const date = String(filters.date ?? "").trim();
  if (!service_id || !resource_id || !date) return null;
  return { service_id, resource_id, date };
}

export async function fetchAvailableSlotsLookupOptions(
  companyId: string,
  filters: Record<string, unknown> | undefined,
  displayField: string,
  valueField: string,
  client: SupabaseClient = defaultClient,
): Promise<LookupOptionRow[]> {
  const context = readRequiredContext(filters);
  if (!context) return [];

  wxRecordServiceResolution("availableSlots.lookup");
  const scheduling = createSchedulingServices(client);
  const resolved = await scheduling.slotGenerationEngine.getAvailableSlots(
    companyId,
    context.resource_id,
    context.service_id,
    context.date,
    { respectBookingRules: true },
  );

  if (!resolved.available || resolved.slots.length === 0) {
    return [];
  }

  const { data: resource } = await client
    .from("scheduling_resources")
    .select("branch_id")
    .eq("company_id", companyId)
    .eq("id", context.resource_id)
    .maybeSingle();

  const branchId = (resource?.branch_id as string | null | undefined) ?? null;
  const records = mapResolvedSlotsToAvailableSlotRecords(resolved, branchId);

  return records.map((record) =>
    availableSlotRecordToLookupRow(record, displayField, valueField),
  );
}

export function availableSlotsLookupQueryKey(
  companyId: string | null,
  filters: Record<string, unknown> | null | undefined,
  displayField: string | null,
  valueField: string | null,
) {
  return [
    "available-slots-lookup",
    companyId,
    filters?.service_id ?? null,
    filters?.resource_id ?? null,
    filters?.date ?? null,
    displayField,
    valueField,
  ] as const;
}
