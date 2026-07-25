import type { SchedulingBookingStatus } from "@/lib/scheduling/booking-domain";

export type CalendarPermissions = {
  canEdit?: boolean;
  canDelete?: boolean;
  canCreate?: boolean;
};

const EDITABLE_STATUSES: SchedulingBookingStatus[] = ["pending", "confirmed"];
const CANCELLABLE_STATUSES: SchedulingBookingStatus[] = ["pending", "confirmed"];
const COMPLETABLE_STATUSES: SchedulingBookingStatus[] = ["confirmed"];

export function canDragEvent(
  status: SchedulingBookingStatus,
  permissions: CalendarPermissions,
): boolean {
  return Boolean(permissions.canEdit) && EDITABLE_STATUSES.includes(status);
}

export function canResizeEvent(
  status: SchedulingBookingStatus,
  permissions: CalendarPermissions,
): boolean {
  return Boolean(permissions.canEdit) && EDITABLE_STATUSES.includes(status);
}

export function canEditEvent(
  status: SchedulingBookingStatus,
  permissions: CalendarPermissions,
): boolean {
  return Boolean(permissions.canEdit) && EDITABLE_STATUSES.includes(status);
}

export function canCancelEvent(
  status: SchedulingBookingStatus,
  permissions: CalendarPermissions,
): boolean {
  return Boolean(permissions.canDelete) && CANCELLABLE_STATUSES.includes(status);
}

export function canCompleteEvent(
  status: SchedulingBookingStatus,
  permissions: CalendarPermissions,
): boolean {
  return Boolean(permissions.canEdit) && COMPLETABLE_STATUSES.includes(status);
}

export function canCreateBooking(permissions: CalendarPermissions): boolean {
  return Boolean(permissions.canCreate);
}
