import type { SchedulingBookingStatus } from "@/lib/scheduling/booking-domain";

export type OperationsAction =
  | "view"
  | "book"
  | "cancel"
  | "check_in"
  | "complete"
  | "edit"
  | "reschedule"
  | "invoice"
  | "call"
  | "whatsapp"
  | "export";

export type OperationsPermissionContext = {
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
};

const ACTION_PERMISSIONS: Record<OperationsAction, string[]> = {
  view: ["bookings.view"],
  book: ["bookings.create"],
  cancel: ["bookings.delete"],
  check_in: ["bookings.edit"],
  complete: ["bookings.edit"],
  edit: ["bookings.edit"],
  reschedule: ["bookings.edit"],
  invoice: ["invoices.create", "invoices.view"],
  call: ["bookings.view", "customers.view"],
  whatsapp: ["bookings.view", "ai.conversations.view"],
  export: ["bookings.view"],
};

export function canPerformOperationsAction(
  action: OperationsAction,
  ctx: OperationsPermissionContext,
): boolean {
  if (ctx.isSuperAdmin) return true;
  const codes = ACTION_PERMISSIONS[action];
  return codes.some((code) => ctx.hasPermission(code));
}

export function canCheckInBooking(
  status: SchedulingBookingStatus,
  ctx: OperationsPermissionContext,
): boolean {
  return (
    canPerformOperationsAction("check_in", ctx) &&
    (status === "confirmed" || status === "pending")
  );
}

export function canCompleteOperationsBooking(
  status: SchedulingBookingStatus,
  ctx: OperationsPermissionContext,
): boolean {
  return (
    canPerformOperationsAction("complete", ctx) &&
    (status === "confirmed" || status === "checked_in")
  );
}

export function canCancelOperationsBooking(
  status: SchedulingBookingStatus,
  ctx: OperationsPermissionContext,
): boolean {
  return (
    canPerformOperationsAction("cancel", ctx) &&
    (status === "pending" || status === "confirmed" || status === "checked_in")
  );
}

export function canRescheduleOperationsBooking(
  status: SchedulingBookingStatus,
  ctx: OperationsPermissionContext,
): boolean {
  return (
    canPerformOperationsAction("reschedule", ctx) &&
    (status === "pending" || status === "confirmed" || status === "checked_in")
  );
}

export function canEditOperationsBooking(
  status: SchedulingBookingStatus,
  ctx: OperationsPermissionContext,
): boolean {
  return (
    canPerformOperationsAction("edit", ctx) &&
    (status === "pending" || status === "confirmed" || status === "checked_in")
  );
}
