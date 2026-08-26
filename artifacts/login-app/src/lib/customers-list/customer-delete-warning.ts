export type CustomerDeleteDependencySummary = {
  bookingCount: number;
  futureBookingCount: number;
  openTicketCount: number;
};

export function buildCustomerDeleteWarningAr(
  deps: CustomerDeleteDependencySummary,
): string | null {
  const parts: string[] = [];
  if (deps.futureBookingCount > 0 || deps.bookingCount > 0) {
    parts.push("هذا العميل مرتبط بموعد أو أكثر. هل أنت متأكد من الحذف؟");
  }
  if (deps.openTicketCount > 0) {
    parts.push(
      `هذا العميل لديه ${deps.openTicketCount} تذكرة مفتوحة. الحذف قد يفصل التذكرة عن العميل.`,
    );
  }
  if (parts.length === 0) return null;
  return parts.join("\n");
}
