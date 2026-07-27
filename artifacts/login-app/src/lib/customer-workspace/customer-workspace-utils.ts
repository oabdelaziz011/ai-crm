import { format, isAfter, parseISO, startOfDay, differenceInDays } from "date-fns";
import type { CustomerProfileTab } from "@/components/customer-profile/types";
import { workspaceRouteSegment } from "@/lib/customer-workspace/workspace-navigation";
import type { Booking, Customer, Invoice } from "@/lib/types";

export function customerInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function computeCustomerLtv(invoices: Invoice[]): number {
  return invoices
    .filter((inv) => inv.customer_id && inv.status === "Paid")
    .reduce((sum, inv) => sum + Number(inv.amount), 0);
}

export function computeOutstandingBalance(invoices: Invoice[]): number {
  return invoices
    .filter((inv) => inv.status === "Unpaid" || inv.status === "Overdue")
    .reduce((sum, inv) => sum + Number(inv.amount), 0);
}

export function deriveCustomerTags(customer: Customer, ltv = 0, bookingCount = 0): string[] {
  const tags: string[] = [];
  if (isVipCustomer(ltv, bookingCount)) tags.push("vip");
  if (customer.email) tags.push("email");
  if (customer.phone) tags.push("phone");
  if (customer.notes?.trim()) tags.push("notes");
  return tags;
}

export function isVipCustomer(ltv: number, bookingCount: number): boolean {
  return ltv >= 500 || bookingCount >= 3;
}

export function lastVisitBooking(bookings: Booking[]): Booking | null {
  const past = bookings
    .filter((b) => b.status !== "Cancelled" && !isAfter(parseISO(b.booking_date), new Date()))
    .sort((a, b) => parseISO(b.booking_date).getTime() - parseISO(a.booking_date).getTime());
  return past[0] ?? null;
}

export type CustomerHealth = {
  score: number;
  labelKey: string;
  tone: "success" | "warning" | "destructive";
};

export function computeCustomerHealth(
  ltv: number,
  outstanding: number,
  cancelledCount: number,
  overdueCount: number,
): CustomerHealth {
  let score = 72;
  if (ltv > 0) score += 10;
  if (ltv >= 500) score += 8;
  if (outstanding > 0) score -= 15;
  if (overdueCount > 0) score -= 20;
  if (cancelledCount >= 2) score -= 18;
  else if (cancelledCount === 1) score -= 8;
  score = Math.max(12, Math.min(98, score));

  if (score >= 75) {
    return { score, labelKey: "dashboard.customerWorkspace.health.strong", tone: "success" };
  }
  if (score >= 45) {
    return { score, labelKey: "dashboard.customerWorkspace.health.moderate", tone: "warning" };
  }
  return { score, labelKey: "dashboard.customerWorkspace.health.atRisk", tone: "destructive" };
}

export type WorkspaceAiInsight = {
  id: string;
  messageKey: string;
  params?: Record<string, string | number>;
  actionTab?: CustomerProfileTab;
};

export function deriveWorkspaceAiInsights(
  customer: Customer,
  bookings: Booking[],
  invoices: Invoice[],
): WorkspaceAiInsight[] {
  const customerBookings = filterBookingsForCustomer(bookings, customer.id);
  const customerInvoices = filterInvoicesForCustomer(invoices, customer.id);
  const cancelled = customerBookings.filter((b) => b.status === "Cancelled").length;
  const ltv = computeCustomerLtv(customerInvoices);
  const overdue = customerInvoices.filter((inv) => inv.status === "Overdue").length;
  const insights: WorkspaceAiInsight[] = [];

  if (cancelled >= 2) {
    insights.push({
      id: "cancelled",
      messageKey: "dashboard.customerWorkspace.aiInsights.cancelled",
      params: { count: cancelled },
      actionTab: "bookings",
    });
  }

  if (ltv >= 500) {
    insights.push({
      id: "high-ltv",
      messageKey: "dashboard.customerWorkspace.aiInsights.highLtv",
      params: { ltv: fmtCurrency(ltv) },
    });
  }

  const lastBooking = lastVisitBooking(customerBookings);
  if (lastBooking) {
    const daysSince = differenceInDays(new Date(), parseISO(lastBooking.booking_date));
    if (daysSince >= 14) {
      insights.push({
        id: "last-contact",
        messageKey: "dashboard.customerWorkspace.aiInsights.lastContact",
        params: { days: daysSince },
        actionTab: "communication",
      });
    }
  } else if (customerBookings.length === 0) {
    insights.push({
      id: "first-booking",
      messageKey: "dashboard.customerWorkspace.aiInsights.firstBooking",
      actionTab: "bookings",
    });
  }

  if (overdue > 0) {
    insights.push({
      id: "collect",
      messageKey: "dashboard.customerWorkspace.aiInsights.collect",
      params: { count: overdue },
      actionTab: "invoices",
    });
  } else if (customerBookings.length >= 2 && cancelled === 0) {
    insights.push({
      id: "gold-package",
      messageKey: "dashboard.customerWorkspace.aiInsights.goldPackage",
      actionTab: "bookings",
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: "healthy",
      messageKey: "dashboard.customerWorkspace.aiInsights.healthy",
    });
  }

  return insights;
}

export function filterBookingsForCustomer(bookings: Booking[], customerId: string): Booking[] {
  return bookings.filter((b) => b.customer_id === customerId);
}

export function filterInvoicesForCustomer(invoices: Invoice[], customerId: string): Invoice[] {
  return invoices.filter((inv) => inv.customer_id === customerId);
}

export function groupBookings(bookings: Booking[]) {
  const now = startOfDay(new Date());
  const upcoming: Booking[] = [];
  const current: Booking[] = [];
  const past: Booking[] = [];
  const cancelled: Booking[] = [];
  const rescheduled: Booking[] = [];

  for (const booking of bookings) {
    const isRescheduled = booking.scheduling_status?.toLowerCase() === "rescheduled";

    if (isRescheduled) {
      rescheduled.push(booking);
      continue;
    }

    const date = startOfDay(parseISO(booking.booking_date));
    if (booking.status === "Cancelled") {
      cancelled.push(booking);
      continue;
    }
    if (isAfter(date, now)) {
      upcoming.push(booking);
    } else if (date.getTime() === now.getTime()) {
      current.push(booking);
    } else {
      past.push(booking);
    }
  }

  const byDate = (a: Booking, b: Booking) =>
    parseISO(a.booking_date).getTime() - parseISO(b.booking_date).getTime();

  return {
    current: current.sort(byDate),
    upcoming: upcoming.sort(byDate),
    past: past.sort((a, b) => byDate(b, a)),
    cancelled: cancelled.sort((a, b) => byDate(b, a)),
    rescheduled: rescheduled.sort((a, b) => byDate(b, a)),
  };
}

export function groupInvoices(invoices: Invoice[]) {
  return {
    outstanding: invoices.filter((inv) => inv.status === "Unpaid" || inv.status === "Overdue"),
    paid: invoices.filter((inv) => inv.status === "Paid"),
    pending: invoices.filter((inv) => inv.status === "Unpaid"),
    overdue: invoices.filter((inv) => inv.status === "Overdue"),
    draft: [] as Invoice[],
  };
}

export function lastPaidInvoice(invoices: Invoice[]): Invoice | null {
  return invoices
    .filter((inv) => inv.status === "Paid")
    .sort((a, b) => parseISO(b.invoice_date).getTime() - parseISO(a.invoice_date).getTime())[0] ?? null;
}

export function recentInvoice(invoices: Invoice[]): Invoice | null {
  return invoices
    .slice()
    .sort((a, b) => parseISO(b.created_at).getTime() - parseISO(a.created_at).getTime())[0] ?? null;
}

export function nextUpcomingBooking(bookings: Booking[]): Booking | null {
  const now = new Date();
  return bookings
    .filter((b) => b.status !== "Cancelled" && isAfter(parseISO(b.booking_date), now))
    .sort((a, b) => parseISO(a.booking_date).getTime() - parseISO(b.booking_date).getTime())[0] ?? null;
}

export function fmtCurrency(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function fmtDate(value: string): string {
  return format(parseISO(value), "MMM d, yyyy");
}

/** Nest-relative href under `/dashboard/customers` (Wouter nested router). */
export function customerWorkspaceHref(customerId: string, tab?: string): string {
  if (!tab || tab === "overview") {
    return `/${customerId}`;
  }
  const segment = workspaceRouteSegment(tab as CustomerProfileTab);
  return `/${customerId}/${segment}`;
}

/** Dashboard-level href for cross-section navigation (bookings, calendar, inbox). */
export function customerWorkspaceDashboardHref(customerId: string, tab?: string): string {
  return `/customers${customerWorkspaceHref(customerId, tab)}`;
}

export type AiCustomerSummary = {
  risk: "low" | "medium" | "high";
  summaryKey: string;
  behaviorKey: string;
  missedKey: string;
  actionKey: string;
  params: Record<string, string | number>;
};

export function buildCustomerActivityTimeline(
  customer: Customer,
  bookings: Booking[],
  invoices: Invoice[],
  limit = 10,
) {
  const items = [
    ...bookings.map((b) => ({
      id: `booking-${b.id}`,
      title: b.service,
      subtitle: b.status,
      timestamp: b.created_at,
    })),
    ...invoices.map((inv) => ({
      id: `invoice-${inv.id}`,
      title: String(inv.amount),
      subtitle: inv.status,
      timestamp: inv.created_at,
    })),
  ];

  return items
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}

export function deriveAiCustomerSummary(
  customer: Customer,
  bookings: Booking[],
  invoices: Invoice[],
): AiCustomerSummary {
  const customerBookings = filterBookingsForCustomer(bookings, customer.id);
  const customerInvoices = filterInvoicesForCustomer(invoices, customer.id);
  const overdue = customerInvoices.filter((inv) => inv.status === "Overdue").length;
  const cancelled = customerBookings.filter((b) => b.status === "Cancelled").length;
  const paid = customerInvoices.filter((inv) => inv.status === "Paid").length;
  const ltv = computeCustomerLtv(customerInvoices);

  let risk: AiCustomerSummary["risk"] = "low";
  if (overdue > 0 || cancelled >= 2) risk = "high";
  else if (cancelled > 0 || customerInvoices.some((inv) => inv.status === "Unpaid")) risk = "medium";

  return {
    risk,
    summaryKey: "dashboard.customerWorkspace.ai.summary",
    behaviorKey: paid > 0
      ? "dashboard.customerWorkspace.ai.behaviorPaying"
      : "dashboard.customerWorkspace.ai.behaviorNew",
    missedKey: cancelled > 0
      ? "dashboard.customerWorkspace.ai.missedYes"
      : "dashboard.customerWorkspace.ai.missedNo",
    actionKey: overdue > 0
      ? "dashboard.customerWorkspace.ai.actionCollect"
      : cancelled > 0
        ? "dashboard.customerWorkspace.ai.actionReengage"
        : "dashboard.customerWorkspace.ai.actionBook",
    params: {
      name: customer.name,
      ltv: fmtCurrency(ltv),
      bookings: customerBookings.length,
      cancelled,
      overdue,
    },
  };
}
