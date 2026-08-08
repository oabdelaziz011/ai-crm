import type { BookingReadModel } from "@workspace/application-layer";
import type { OperationsRow } from "@workspace/universal-operations-engine";
import type { OperationsWorkspaceConfig } from "@workspace/universal-operations-engine";
import type { OperationsBookingView } from "@/lib/scheduling/operations/types";

const STATUS_MAP: Record<string, string> = {
  pending: "st_waiting",
  waiting: "st_waiting",
  booked: "st_waiting",
  confirmed: "st_confirmed",
  checked_in: "st_checked_in",
  with_nurse: "st_with_nurse",
  in_progress: "st_with_doctor",
  with_doctor: "st_with_doctor",
  completed: "st_completed",
  archived: "st_archived",
  cancelled: "st_archived",
  no_show: "st_archived",
  rescheduled: "st_waiting",
};

const PAYMENT_MAP: Record<string, string> = {
  unpaid: "pay_pending",
  pending: "pay_pending",
  partial: "pay_partial",
  paid: "pay_paid",
  refunded: "pay_refunded",
  cancelled: "pay_cancelled",
};

function resolveStatusId(status: string, config: OperationsWorkspaceConfig): string {
  const normalized = status.toLowerCase();
  const fromConfig = config.statuses.find((s) => s.internalName === normalized);
  if (fromConfig) return fromConfig.id;
  return STATUS_MAP[normalized] ?? config.statuses[0]?.id ?? "st_waiting";
}

function resolvePaymentStatusId(paymentStatus: string, config: OperationsWorkspaceConfig): string {
  const normalized = paymentStatus.toLowerCase();
  const fromConfig = config.paymentStatuses.find((s) => s.internalName === normalized);
  if (fromConfig) return fromConfig.id;
  return PAYMENT_MAP[normalized] ?? "pay_pending";
}

function displayStatus(status: string): string {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function computeWaitingMinutes(startAt: string): number {
  const diff = Date.now() - new Date(startAt).getTime();
  return diff > 0 ? Math.floor(diff / 60_000) : 0;
}

function resolveStatusIdFromDisplay(displayStatus: string, config: OperationsWorkspaceConfig): string {
  const fromConfig = config.statuses.find((status) => status.displayName === displayStatus);
  if (fromConfig) return fromConfig.id;
  const normalized = displayStatus.toLowerCase().replace(/\s+/g, "_");
  return resolveStatusId(normalized, config);
}

function resolvePaymentStatusIdFromDisplay(displayStatus: string, config: OperationsWorkspaceConfig): string {
  const fromConfig = config.paymentStatuses.find((status) => status.displayName === displayStatus);
  if (fromConfig) return fromConfig.id;
  const normalized = displayStatus.toLowerCase();
  return resolvePaymentStatusId(normalized, config);
}

function normalizeVisitType(raw: unknown): string {
  const value = String(raw ?? "").trim();
  if (!value) return "Unknown";
  const token = value.toLowerCase().replace(/[\s_-]+/g, "");
  if (token === "new") return "New";
  if (token === "followup" || token === "follow") return "FollowUp";
  if (token === "consultation") return "Consultation";
  if (token === "emergency") return "Emergency";
  if (token === "vip") return "VIP";
  if (token === "unknown") return "Unknown";
  return value;
}

/** Presentation-only priority from visit type (no booking mutation). */
function priorityFromVisitType(visitType: string): OperationsRow["priority"] {
  if (visitType === "Emergency" || visitType === "VIP") return "urgent";
  if (visitType === "Consultation") return "high";
  if (visitType === "FollowUp") return "low";
  return "normal";
}

/** Maps application-layer booking read model → Universal Operations grid row. */
export function mapBookingReadModelToRow(
  booking: BookingReadModel,
  config: OperationsWorkspaceConfig,
): OperationsRow {
  const statusId = resolveStatusIdFromDisplay(booking.status, config);
  const paymentStatusId = resolvePaymentStatusIdFromDisplay(booking.paymentStatus, config);
  const statusDef = config.statuses.find((status) => status.id === statusId);
  const visitType = normalizeVisitType(booking.visitType);

  return {
    id: booking.id,
    companyId: booking.tenantId,
    customerId: booking.customerId || null,
    leadId: null,
    statusId,
    paymentStatusId,
    assignedResourceId: booking.employeeId ?? null,
    priority: priorityFromVisitType(visitType),
    tags: visitType === "VIP" ? ["VIP"] : [],
    values: {
      reference: booking.reference,
      customer: booking.customerName,
      phone: booking.phone ?? null,
      service: booking.serviceName ?? "—",
      resource: booking.employeeName ?? "—",
      status: statusDef?.displayName ?? booking.status,
      payment_status: booking.paymentStatus,
      visit_type: visitType,
      scheduled_at: booking.scheduledAt,
      appointment_time: booking.scheduledAt,
      waiting_minutes: computeWaitingMinutes(booking.scheduledAt),
      duration_minutes: booking.durationMinutes ?? null,
      amount: booking.amountCents ?? 0,
      currency: booking.currency ?? "USD",
      discount_cents: booking.discountCents ?? 0,
      tax_cents: booking.taxCents ?? 0,
      tags: [],
      branch: booking.branchName?.trim() ? booking.branchName : "—",
    },
    createdAt: booking.scheduledAt,
    updatedAt: booking.scheduledAt,
  };
}

/** Maps live scheduling booking → Universal Operations grid row (UI contract unchanged). */
export function mapOperationsBookingToRow(
  booking: OperationsBookingView,
  config: OperationsWorkspaceConfig,
): OperationsRow {
  const statusId = resolveStatusId(booking.status, config);
  const paymentStatusId = resolvePaymentStatusId(booking.paymentStatus, config);
  const statusDef = config.statuses.find((s) => s.id === statusId);
  const visitType = normalizeVisitType(booking.visitType);

  return {
    id: booking.id,
    companyId: booking.companyId,
    customerId: booking.customerId,
    leadId: null,
    statusId,
    paymentStatusId,
    assignedResourceId: booking.resourceId,
    priority: priorityFromVisitType(visitType),
    tags: visitType === "VIP" ? ["VIP"] : [],
    values: {
      reference: booking.id.slice(0, 8).toUpperCase(),
      customer: booking.customer?.name ?? "—",
      phone: booking.customer?.phone ?? null,
      service: booking.service?.name ?? "—",
      resource: booking.resource?.name ?? "—",
      status: statusDef?.displayName ?? displayStatus(booking.status),
      payment_status: booking.paymentStatus,
      visit_type: visitType,
      scheduled_at: booking.startAt,
      appointment_time: booking.startAt,
      waiting_minutes: computeWaitingMinutes(booking.startAt),
      duration_minutes: booking.durationMinutes ?? null,
      // Booking price snapshot only — never live service price.
      amount: booking.amountCents ?? 0,
      currency: booking.currency ?? "USD",
      discount_cents: booking.discountCents ?? 0,
      tax_cents: booking.taxCents ?? 0,
      tags: [],
      branch: booking.branch?.name ?? "—",
    },
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
  };
}
