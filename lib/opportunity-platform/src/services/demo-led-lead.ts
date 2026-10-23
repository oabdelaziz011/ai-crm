/**
 * Detect demo-led sales journeys from persisted CRM / scheduling evidence.
 * Used to gate automatic Opportunity creation until a human converts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const DEMO_LED_LIFECYCLES = new Set(["demo_scheduled", "demo_completed"]);

export function isDemoLedLifecycle(lifecycleStatus: string | null | undefined): boolean {
  const status = String(lifecycleStatus ?? "")
    .trim()
    .toLowerCase();
  return DEMO_LED_LIFECYCLES.has(status);
}

/**
 * True when the lead has a non-deleted sales_demo booking link, or lifecycle is
 * demo_scheduled / demo_completed.
 */
export async function isDemoLedLead(
  client: SupabaseClient,
  input: { companyId: string; leadId: string; lifecycleStatus?: string | null },
): Promise<boolean> {
  if (isDemoLedLifecycle(input.lifecycleStatus)) return true;

  const { data: bookings, error } = await client
    .from("scheduling_bookings")
    .select("id, service_id")
    .eq("company_id", input.companyId)
    .eq("lead_id", input.leadId)
    .is("deleted_at", null)
    .limit(20);
  if (error) throw new Error(error.message);
  if (!bookings?.length) return false;

  const serviceIds = [
    ...new Set(
      bookings
        .map((row) => (row.service_id ? String(row.service_id) : ""))
        .filter(Boolean),
    ),
  ];
  if (!serviceIds.length) return false;

  const { data: services, error: serviceError } = await client
    .from("scheduling_services")
    .select("id, service_kind")
    .eq("company_id", input.companyId)
    .in("id", serviceIds)
    .is("deleted_at", null);
  if (serviceError) throw new Error(serviceError.message);

  return (services ?? []).some(
    (row) => String(row.service_kind ?? "").trim().toLowerCase() === "sales_demo",
  );
}
