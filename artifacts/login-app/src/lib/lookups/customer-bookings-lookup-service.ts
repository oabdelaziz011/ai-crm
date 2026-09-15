import type { SupabaseClient } from "@supabase/supabase-js";
import { TimezoneResolver } from "@/lib/scheduling/availability-engine/timezone-resolver";
import { BookingRepository } from "@/lib/scheduling/booking-domain/booking-repository";
import { findCustomerIdsByPhone } from "@/lib/booking/scheduling-booking-lookup";
import { mapRecordsToLookupRows } from "./map-lookup-rows";
import type { ListLookupFilters, LookupOptionRow } from "./types";

function readFilter(filters: ListLookupFilters | undefined, key: string): string {
  const raw = filters?.[key];
  if (typeof raw !== "string") return "";
  const value = raw.trim();
  if (!value || value.includes("{{")) return "";
  return value;
}

export async function fetchCustomerBookingsLookupOptions(
  companyId: string,
  filters: ListLookupFilters | undefined,
  displayField: string,
  valueField: string,
  client: SupabaseClient,
): Promise<LookupOptionRow[]> {
  const customerId = readFilter(filters, "customer_id");
  const phone = readFilter(filters, "phone");
  // A phone explicitly collected for this operation is authoritative. The
  // conversation customer can be an Instagram-only identity that is not the
  // customer record owning the scheduling booking.
  const customerIds = phone
    ? await findCustomerIdsByPhone(client, companyId, phone)
    : customerId
      ? [customerId]
      : [];
  if (customerIds.length === 0) return [];

  const bookings = await new BookingRepository(client).listUpcomingByCustomerIds(companyId, customerIds);
  if (bookings.length === 0) return [];

  const resourceIds = [...new Set(bookings.map((row) => row.resource_id).filter(Boolean))];
  const resourceNames = new Map<string, string>();
  if (resourceIds.length > 0) {
    const { data, error } = await client
      .from("scheduling_resources")
      .select("id, name")
      .eq("company_id", companyId)
      .in("id", resourceIds);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      if (typeof row.id === "string" && typeof row.name === "string") {
        resourceNames.set(row.id, row.name);
      }
    }
  }

  const records = bookings.map((booking) => {
    const timezone = booking.timezone?.trim() || "Africa/Cairo";
    const instant = TimezoneResolver.parseInstant(booking.start_at);
    const date = TimezoneResolver.localDateForInstant(instant, timezone);
    const time = TimezoneResolver.localTimeForInstant(instant, timezone);
    const doctorName = resourceNames.get(booking.resource_id) ?? "";
    const confirmation = booking.confirmation_number?.trim() || "";
    const displayLabel = [confirmation, doctorName, `${date} ${time}`].filter(Boolean).join(" · ");

    return {
      id: booking.id,
      display_label: displayLabel || booking.id,
      confirmation_number: confirmation || null,
      start_at: booking.start_at,
      display_time: `${date} ${time}`,
      resource_id: booking.resource_id,
      service_id: booking.service_id,
      status: booking.status,
      customer_id: booking.customer_id,
    };
  });

  const display =
    displayField === "label" || displayField === "name" || displayField === "title" || !String(displayField ?? "").trim()
      ? "display_label"
      : displayField;

  return mapRecordsToLookupRows(records, {
    displayField: display,
    valueField: valueField || "id",
  });
}
