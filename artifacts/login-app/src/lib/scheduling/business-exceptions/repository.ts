import type { SupabaseClient } from "@supabase/supabase-js";
import { ACTIVE_BOOKING_STATUSES, type SchedulingBooking } from "@/lib/scheduling/booking-domain/types";
import type {
  BusinessAppointmentExceptionItemRecord,
  BusinessAppointmentExceptionRecord,
  ExceptionCancellationStatus,
  ExceptionNotificationStatus,
} from "./types";

function isUniqueViolation(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "23505") return true;
  const message = error.message ?? "";
  return /duplicate key|unique constraint/i.test(message);
}

export class BusinessAppointmentExceptionRepository {
  constructor(private readonly client: SupabaseClient) {}

  async findByIdempotencyKey(
    companyId: string,
    idempotencyKey: string,
  ): Promise<BusinessAppointmentExceptionRecord | null> {
    const { data, error } = await this.client
      .from("business_appointment_exceptions")
      .select("*")
      .eq("company_id", companyId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as BusinessAppointmentExceptionRecord | null) ?? null;
  }

  async insertException(
    values: Omit<
      BusinessAppointmentExceptionRecord,
      "id" | "created_at" | "completed_at" | "error_message"
    > & { id?: string; error_message?: string | null },
  ): Promise<BusinessAppointmentExceptionRecord> {
    const { data, error } = await this.client
      .from("business_appointment_exceptions")
      .insert(values)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as BusinessAppointmentExceptionRecord;
  }

  async updateException(
    id: string,
    companyId: string,
    patch: Partial<BusinessAppointmentExceptionRecord>,
  ): Promise<BusinessAppointmentExceptionRecord> {
    const { data, error } = await this.client
      .from("business_appointment_exceptions")
      .update(patch)
      .eq("id", id)
      .eq("company_id", companyId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as BusinessAppointmentExceptionRecord;
  }

  async insertItem(values: {
    exception_id: string;
    company_id: string;
    booking_id: string;
    customer_id: string;
    cancellation_status: ExceptionCancellationStatus;
    notification_status: ExceptionNotificationStatus;
    notification_queue_id?: string | null;
    provider_message_id?: string | null;
    error_message?: string | null;
  }): Promise<BusinessAppointmentExceptionItemRecord> {
    const { data, error } = await this.client
      .from("business_appointment_exception_items")
      .insert(values)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as BusinessAppointmentExceptionItemRecord;
  }

  /**
   * Durable claim for concurrent exception windows.
   * Returns null when another exception already claimed this booking.
   */
  async tryClaimItem(values: {
    exception_id: string;
    company_id: string;
    booking_id: string;
    customer_id: string;
  }): Promise<BusinessAppointmentExceptionItemRecord | null> {
    const { data, error } = await this.client
      .from("business_appointment_exception_items")
      .insert({
        ...values,
        cancellation_status: "pending",
        notification_status: "pending",
      })
      .select("*")
      .single();

    if (error) {
      if (isUniqueViolation(error)) return null;
      throw new Error(error.message);
    }
    return data as BusinessAppointmentExceptionItemRecord;
  }

  async updateItem(
    id: string,
    companyId: string,
    patch: Partial<{
      cancellation_status: ExceptionCancellationStatus;
      notification_status: ExceptionNotificationStatus;
      notification_queue_id: string | null;
      provider_message_id: string | null;
      error_message: string | null;
    }>,
  ): Promise<void> {
    const { error } = await this.client
      .from("business_appointment_exception_items")
      .update(patch)
      .eq("id", id)
      .eq("company_id", companyId);
    if (error) throw new Error(error.message);
  }

  async listItemsForException(
    exceptionId: string,
    companyId: string,
  ): Promise<BusinessAppointmentExceptionItemRecord[]> {
    const { data, error } = await this.client
      .from("business_appointment_exception_items")
      .select("*")
      .eq("exception_id", exceptionId)
      .eq("company_id", companyId);
    if (error) throw new Error(error.message);
    return (data as BusinessAppointmentExceptionItemRecord[]) ?? [];
  }

  async listCancellableByServiceAndWindow(input: {
    companyId: string;
    serviceId: string;
    windowStartAt: string;
    windowEndAt: string;
  }): Promise<SchedulingBooking[]> {
    const { data, error } = await this.client
      .from("scheduling_bookings")
      .select("*")
      .eq("company_id", input.companyId)
      .eq("service_id", input.serviceId)
      .is("deleted_at", null)
      .in("status", ACTIVE_BOOKING_STATUSES)
      .lt("start_at", input.windowEndAt)
      .gt("end_at", input.windowStartAt)
      .order("start_at", { ascending: true });

    if (error) throw new Error(error.message);
    return (data as SchedulingBooking[]) ?? [];
  }

  async findExistingItemForBooking(
    companyId: string,
    bookingId: string,
  ): Promise<{ exception_id: string; cancellation_status: string } | null> {
    const { data, error } = await this.client
      .from("business_appointment_exception_items")
      .select("exception_id, cancellation_status")
      .eq("company_id", companyId)
      .eq("booking_id", bookingId)
      .in("cancellation_status", ["pending", "cancelled"])
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? null;
  }
}
