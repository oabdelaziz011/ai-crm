import type { SchedulingBooking } from "@/lib/scheduling/booking-domain";
import {
  BookingDomainError,
  formatBookingValidationErrors,
} from "@/lib/scheduling/booking-domain";
import i18n from "@/i18n";
import type { Booking, BookingStatus } from "@/lib/types";

export type SchedulingBookingListRow = SchedulingBooking & {
  customers?: Pick<{ id: string; name: string }, "id" | "name"> | null;
  scheduling_services?: Pick<
    { id: string; name: string; duration_minutes: number },
    "id" | "name" | "duration_minutes"
  > | null;
  scheduling_resources?: Pick<{ id: string; name: string }, "id" | "name"> | null;
};

export type AppBooking = Booking & {
  isSchedulingBooking: boolean;
  service_id?: string | null;
  resource_id?: string | null;
  scheduling_status?: SchedulingBooking["status"];
  source?: SchedulingBooking["source"];
};

const STATUS_MAP: Record<SchedulingBooking["status"], BookingStatus> = {
  pending: "Pending",
  confirmed: "Confirmed",
  checked_in: "Confirmed",
  with_nurse: "Confirmed",
  in_progress: "Confirmed",
  completed: "Confirmed",
  archived: "Cancelled",
  cancelled: "Cancelled",
  no_show: "Cancelled",
  rescheduled: "Cancelled",
};

export function mapSchedulingStatus(status: SchedulingBooking["status"]): BookingStatus {
  return STATUS_MAP[status];
}

export function schedulingBookingToAppBooking(
  row: SchedulingBookingListRow,
  fallbackUserId = "",
): AppBooking {
  return {
    id: row.id,
    user_id: row.created_by ?? fallbackUserId,
    customer_id: row.customer_id,
    service: row.scheduling_services?.name ?? "—",
    doctor_id: row.resource_id,
    location_id: row.branch_id,
    booking_date: row.start_at,
    duration_minutes: row.scheduling_services?.duration_minutes ?? null,
    notes: row.notes,
    status: mapSchedulingStatus(row.status),
    created_at: row.created_at,
    updated_at: row.updated_at,
    customers: row.customers ?? null,
    isSchedulingBooking: true,
    service_id: row.service_id,
    resource_id: row.resource_id,
    scheduling_status: row.status,
    source: row.source,
    confirmation_number: row.confirmation_number ?? null,
  };
}

export function mergeBookingLists(
  scheduling: AppBooking[],
  legacy: Booking[],
): AppBooking[] {
  const schedulingIds = new Set(scheduling.map((item) => item.id));
  const legacyOnly = legacy
    .filter((item) => !schedulingIds.has(item.id))
    .map(
      (item): AppBooking => ({
        ...item,
        isSchedulingBooking: false,
        scheduling_status: undefined,
        source: undefined,
      }),
    );
  return [...scheduling, ...legacyOnly].sort(
    (a, b) => new Date(a.booking_date).getTime() - new Date(b.booking_date).getTime(),
  );
}

export function formatBookingDomainError(
  error: unknown,
  translate: (key: string) => string = (key) => i18n.t(key, { ns: "common" }),
): string {
  if (error instanceof BookingDomainError) {
    return formatBookingValidationErrors(error.codes, translate);
  }
  if (error instanceof Error) {
    return error.message;
  }
  return translate("scheduling.bookingDomain.errors.generic");
}
