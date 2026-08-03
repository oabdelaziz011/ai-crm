import type { BookingReadModel } from "@workspace/application-layer";
import type { OperationsRow } from "@workspace/universal-operations-engine";
import type { OperationsWorkspaceConfig } from "@workspace/universal-operations-engine";
import type { OperationsBookingView } from "@/lib/scheduling/operations/types";

const STATUS_MAP: Record<string, string> = {
  pending: "st_booked",
  confirmed: "st_confirmed",
  checked_in: "st_checked_in",
  in_progress: "st_in_progress",
  completed: "st_completed",
  cancelled: "st_archived",
  no_show: "st_archived",
  rescheduled: "st_booked",
};

const PAYMENT_MAP: Record<string, string> = {
  unpaid: "pay_unpaid",
  partial: "pay_partial",
  paid: "pay_paid",
  refunded: "pay_refunded",
};

function resolveStatusId(status: string, config: OperationsWorkspaceConfig): string {
  const normalized = status.toLowerCase();
  const fromConfig = config.statuses.find((s) => s.internalName === normalized);
  if (fromConfig) return fromConfig.id;
  return STATUS_MAP[normalized] ?? config.statuses[0]?.id ?? "st_booked";
}

function resolvePaymentStatusId(paymentStatus: string, config: OperationsWorkspaceConfig): string {
  const normalized = paymentStatus.toLowerCase();
  const fromConfig = config.paymentStatuses.find((s) => s.internalName === normalized);
  if (fromConfig) return fromConfig.id;
  return PAYMENT_MAP[normalized] ?? "pay_unpaid";
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

/** Maps application-layer booking read model → Universal Operations grid row. */
export function mapBookingReadModelToRow(
  booking: BookingReadModel,
  config: OperationsWorkspaceConfig,
): OperationsRow {
  const statusId = resolveStatusIdFromDisplay(booking.status, config);
  const paymentStatusId = resolvePaymentStatusIdFromDisplay(booking.paymentStatus, config);
  const statusDef = config.statuses.find((status) => status.id === statusId);

  return {
    id: booking.id,
    companyId: booking.tenantId,
    customerId: booking.customerId || null,
    leadId: null,
    statusId,
    paymentStatusId,
    assignedResourceId: booking.employeeId ?? null,
    priority: "normal",
    tags: [],
    values: {
      reference: booking.reference,
      customer: booking.customerName,
      phone: null,
      service: booking.serviceName ?? "—",
      resource: booking.employeeName ?? "—",
      status: statusDef?.displayName ?? booking.status,
      payment_status: booking.paymentStatus,
      scheduled_at: booking.scheduledAt,
      waiting_minutes: computeWaitingMinutes(booking.scheduledAt),
      amount: 0,
      tags: [],
      branch: "—",
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

  return {
    id: booking.id,
    companyId: booking.companyId,
    customerId: booking.customerId,
    leadId: null,
    statusId,
    paymentStatusId,
    assignedResourceId: booking.resourceId,
    priority: "normal",
    tags: [],
    values: {
      reference: booking.id.slice(0, 8).toUpperCase(),
      customer: booking.customer?.name ?? "—",
      phone: booking.customer?.phone ?? null,
      service: booking.service?.name ?? "—",
      resource: booking.resource?.name ?? "—",
      status: statusDef?.displayName ?? displayStatus(booking.status),
      payment_status: booking.paymentStatus,
      scheduled_at: booking.startAt,
      waiting_minutes: computeWaitingMinutes(booking.startAt),
      amount: booking.service?.priceCents ?? 0,
      tags: [],
      branch: booking.branch?.name ?? "—",
    },
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
  };
}
