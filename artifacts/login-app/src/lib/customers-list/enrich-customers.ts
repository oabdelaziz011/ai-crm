import { differenceInDays, isSameDay, parseISO, startOfDay } from "date-fns";
import {
  computeCustomerLtv,
  computeOutstandingBalance,
  deriveCustomerTags,
  filterBookingsForCustomer,
  filterInvoicesForCustomer,
  isVipCustomer,
  lastVisitBooking,
  nextUpcomingBooking,
} from "@/lib/customer-workspace/customer-workspace-utils";
import type { Booking, Customer, Invoice } from "@/lib/types";
import type { CustomerListStatus, EnrichedCustomerRow } from "./types";

function deriveCompany(customer: Customer): string | null {
  if (!customer.email) return null;
  const domain = customer.email.split("@")[1]?.trim();
  if (!domain || ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com"].includes(domain.toLowerCase())) {
    return null;
  }
  const label = domain.split(".")[0];
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : null;
}

function deriveSource(customer: Customer, bookingCount: number): string {
  if (bookingCount >= 2) return "repeat";
  if (customer.notes?.toLowerCase().includes("referral")) return "referral";
  if (customer.notes?.toLowerCase().includes("whatsapp")) return "whatsapp";
  if (customer.phone && !customer.email) return "phone";
  if (customer.email) return "web";
  return "direct";
}

function deriveStatus(
  customer: Customer,
  bookingCount: number,
  outstanding: number,
  lastActivity: string | null,
): CustomerListStatus {
  const createdDays = differenceInDays(new Date(), parseISO(customer.created_at));
  if (createdDays <= 30 && bookingCount === 0) return "new";
  if (outstanding > 0) return "at_risk";

  if (!lastActivity) {
    return bookingCount > 0 ? "inactive" : "new";
  }

  const inactiveDays = differenceInDays(new Date(), parseISO(lastActivity));
  if (inactiveDays >= 90) return "inactive";
  return "active";
}

function resolveLastActivity(
  customer: Customer,
  bookings: Booking[],
  invoices: Invoice[],
): string | null {
  const timestamps = [
    customer.updated_at,
    ...bookings.map((b) => b.updated_at),
    ...invoices.map((inv) => inv.updated_at),
  ].filter(Boolean) as string[];

  if (timestamps.length === 0) return null;
  return timestamps.sort((a, b) => parseISO(b).getTime() - parseISO(a).getTime())[0] ?? null;
}

function needsFollowUp(row: Omit<EnrichedCustomerRow, "needsFollowUp">): boolean {
  if (row.outstanding > 0) return true;
  if (!row.lastActivity) return row.bookingCount === 0;
  return differenceInDays(new Date(), parseISO(row.lastActivity)) >= 14;
}

export function enrichCustomerRow(
  customer: Customer,
  bookings: Booking[],
  invoices: Invoice[],
): EnrichedCustomerRow {
  const customerBookings = filterBookingsForCustomer(bookings, customer.id);
  const customerInvoices = filterInvoicesForCustomer(invoices, customer.id);
  const ltv = computeCustomerLtv(customerInvoices);
  const outstanding = computeOutstandingBalance(customerInvoices);
  const bookingCount = customerBookings.filter((b) => b.status !== "Cancelled").length;
  const isVip = isVipCustomer(ltv, bookingCount);
  const tags = deriveCustomerTags(customer, ltv, bookingCount);
  const nextAppointment = nextUpcomingBooking(customerBookings);
  const lastVisit = lastVisitBooking(customerBookings);
  const lastActivity = resolveLastActivity(customer, customerBookings, customerInvoices);
  const today = startOfDay(new Date());
  const hasAppointmentToday = customerBookings.some(
    (b) => b.status !== "Cancelled" && isSameDay(parseISO(b.booking_date), today),
  );

  const base = {
    customer,
    ltv,
    outstanding,
    bookingCount,
    isVip,
    tags,
    status: deriveStatus(customer, bookingCount, outstanding, lastActivity),
    company: deriveCompany(customer),
    assignedEmployee: null,
    branch: null,
    source: deriveSource(customer, bookingCount),
    nextAppointment,
    lastActivity,
    lastVisit,
    hasAppointmentToday,
  };

  return {
    ...base,
    needsFollowUp: needsFollowUp(base),
  };
}

export function enrichCustomers(
  customers: Customer[],
  bookings: Booking[],
  invoices: Invoice[],
): EnrichedCustomerRow[] {
  return customers.map((customer) => enrichCustomerRow(customer, bookings, invoices));
}
