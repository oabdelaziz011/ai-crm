export type CustomerDeleteDependencySummary = {
  bookingCount: number;
  futureBookingCount: number;
  openTicketCount: number;
  /** Bookings that block hard-delete via FK (includes soft-deleted rows). */
  blockingBookingCount: number;
};

export function buildCustomerDeleteWarningAr(
  deps: CustomerDeleteDependencySummary,
): string | null {
  const parts: string[] = [];
  if (deps.blockingBookingCount > 0 || deps.futureBookingCount > 0 || deps.bookingCount > 0) {
    parts.push(
      "هذا العميل مرتبط بموعد أو أكثر في النظام. لا يمكن حذفه حتى يتم إلغاء أو نقل المواعيد المرتبطة.",
    );
  }
  if (deps.openTicketCount > 0) {
    parts.push(
      `هذا العميل لديه ${deps.openTicketCount} تذكرة مفتوحة. الحذف سيفصل التذكرة عن العميل.`,
    );
  }
  if (parts.length === 0) return null;
  return parts.join("\n");
}

/** True when hard-delete would violate booking FK / business protection. */
export function isCustomerDeleteBlockedByBookings(
  deps: CustomerDeleteDependencySummary,
): boolean {
  return deps.blockingBookingCount > 0 || deps.bookingCount > 0 || deps.futureBookingCount > 0;
}
