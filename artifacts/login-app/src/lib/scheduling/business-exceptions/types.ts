import type { SchedulingBooking } from "@/lib/scheduling/booking-domain/types";

export const BUSINESS_EXCEPTION_SCOPES = ["full_day", "hours"] as const;
export type BusinessExceptionScope = (typeof BUSINESS_EXCEPTION_SCOPES)[number];

export const BUSINESS_EXCEPTION_STATUSES = ["pending", "completed", "failed"] as const;
export type BusinessExceptionStatus = (typeof BUSINESS_EXCEPTION_STATUSES)[number];

export const EXCEPTION_NOTIFICATION_STATUSES = [
  "pending",
  "queued",
  "sent",
  "failed",
  "skipped",
] as const;
export type ExceptionNotificationStatus = (typeof EXCEPTION_NOTIFICATION_STATUSES)[number];

export const EXCEPTION_CANCELLATION_STATUSES = ["pending", "cancelled", "skipped", "failed"] as const;
export type ExceptionCancellationStatus = (typeof EXCEPTION_CANCELLATION_STATUSES)[number];

export type BusinessApologyExceptionInput = {
  serviceId: string;
  exceptionDate: string;
  scope: BusinessExceptionScope;
  startTime?: string | null;
  endTime?: string | null;
  comment: string;
  /** Client-generated key for safe retries. */
  idempotencyKey: string;
};

export type BusinessApologyPreviewResult = {
  timezone: string;
  windowStartAt: string;
  windowEndAt: string;
  affectedAppointmentsCount: number;
  affectedCustomersCount: number;
  appointments: Array<{
    id: string;
    customerId: string;
    startAt: string;
    endAt: string;
    status: SchedulingBooking["status"];
  }>;
};

export type BusinessApologyExecuteResult = {
  exceptionId: string;
  status: BusinessExceptionStatus;
  affectedAppointmentsCount: number;
  cancelledAppointmentsCount: number;
  notificationQueuedCount: number;
  notificationSentCount: number;
  notificationFailedCount: number;
  notificationSkippedCount: number;
  reusedExisting: boolean;
  messageKey:
    | "success"
    | "partial_notifications"
    | "notifications_queued"
    | "zero_affected"
    | "already_completed";
};

export type BusinessAppointmentExceptionRecord = {
  id: string;
  company_id: string;
  created_by: string | null;
  service_id: string;
  exception_date: string;
  scope: BusinessExceptionScope;
  start_time: string | null;
  end_time: string | null;
  comment: string;
  status: BusinessExceptionStatus;
  timezone: string;
  window_start_at: string;
  window_end_at: string;
  idempotency_key: string;
  affected_appointments_count: number;
  cancelled_appointments_count: number;
  notification_queued_count: number;
  notification_sent_count: number;
  notification_failed_count: number;
  notification_skipped_count: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
};

export type BusinessAppointmentExceptionItemRecord = {
  id: string;
  exception_id: string;
  company_id: string;
  booking_id: string;
  customer_id: string;
  cancellation_status: ExceptionCancellationStatus;
  notification_status: ExceptionNotificationStatus;
  notification_queue_id: string | null;
  provider_message_id: string | null;
  error_message: string | null;
};

export class BusinessApologyExceptionError extends Error {
  constructor(
    message: string,
    readonly code:
      | "unauthorized"
      | "invalid_input"
      | "invalid_time_range"
      | "service_not_found"
      | "duplicate_in_progress",
  ) {
    super(message);
    this.name = "BusinessApologyExceptionError";
  }
}
