import {
  endOfMonth,
  format,
  isSameDay,
  isWithinInterval,
  parseISO,
  startOfMonth,
  startOfWeek,
  endOfWeek,
  subWeeks,
  subMonths,
} from "date-fns";
import type { Booking, Customer, Invoice } from "@/lib/types";

export const EXECUTIVE_MONTHS = 7;

export type PeriodTrend = {
  current: number;
  previous: number;
  changePct: number;
  trendUp: boolean;
  comparisonLabel: string;
};

export type MonthlyPoint = {
  month: string;
  label: string;
  value: number;
};

export type ActivityItem = {
  id: string;
  type: "customer" | "booking" | "invoice";
  title: string;
  subtitle: string;
  timestamp: string;
  href: string;
};

export type AiInsightResult = {
  severity: "info" | "warning" | "success";
  titleKey: string;
  bodyKey: string;
  bodyParams?: Record<string, string | number>;
};

export type ExecutiveKpiId =
  | "revenue"
  | "bookings"
  | "customers"
  | "outstanding"
  | "conversion"
  | "utilization";

export function comparePeriods(current: number, previous: number): PeriodTrend {
  if (previous === 0) {
    const changePct = current > 0 ? 100 : 0;
    return {
      current,
      previous,
      changePct,
      trendUp: current >= previous,
      comparisonLabel: current > 0 ? "+100%" : "0%",
    };
  }

  const raw = ((current - previous) / previous) * 100;
  const changePct = Math.round(raw);
  return {
    current,
    previous,
    changePct,
    trendUp: changePct >= 0,
    comparisonLabel: `${changePct >= 0 ? "+" : ""}${changePct}%`,
  };
}

function parseDate(value: string): Date {
  return parseISO(value);
}

function inMonth(date: Date, ref: Date): boolean {
  return date.getMonth() === ref.getMonth() && date.getFullYear() === ref.getFullYear();
}

function inPreviousMonth(date: Date, ref: Date): boolean {
  const prev = subMonths(ref, 1);
  return inMonth(date, prev);
}

export function buildMonthBuckets(now = new Date(), count = EXECUTIVE_MONTHS): Date[] {
  return Array.from({ length: count }, (_, index) => subMonths(now, count - 1 - index));
}

export function monthlyRevenue(invoices: Invoice[], months: Date[]): MonthlyPoint[] {
  return months.map((month) => {
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    const value = invoices
      .filter((inv) => inv.status === "Paid")
      .filter((inv) => {
        const d = parseDate(inv.invoice_date);
        return isWithinInterval(d, { start, end });
      })
      .reduce((sum, inv) => sum + Number(inv.amount), 0);

    return { month: format(month, "yyyy-MM"), label: format(month, "MMM"), value };
  });
}

export function monthlyBookings(bookings: Booking[], months: Date[]): MonthlyPoint[] {
  return months.map((month) => {
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    const value = bookings.filter((b) => {
      const d = parseDate(b.booking_date);
      return isWithinInterval(d, { start, end });
    }).length;

    return { month: format(month, "yyyy-MM"), label: format(month, "MMM"), value };
  });
}

export function monthlyCustomerGrowth(customers: Customer[], months: Date[]): MonthlyPoint[] {
  let cumulative = 0;
  return months.map((month) => {
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    const added = customers.filter((c) => {
      const d = parseDate(c.created_at);
      return isWithinInterval(d, { start, end });
    }).length;
    cumulative += added;
    return { month: format(month, "yyyy-MM"), label: format(month, "MMM"), value: cumulative };
  });
}

export function monthlyCollections(invoices: Invoice[], months: Date[]): MonthlyPoint[] {
  return months.map((month) => {
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    const inRange = invoices.filter((inv) => {
      const d = parseDate(inv.invoice_date);
      return isWithinInterval(d, { start, end });
    });
    const collected = inRange
      .filter((inv) => inv.status === "Paid")
      .reduce((sum, inv) => sum + Number(inv.amount), 0);
    const total = inRange.reduce((sum, inv) => sum + Number(inv.amount), 0);
    const value = total > 0 ? Math.round((collected / total) * 100) : 0;

    return { month: format(month, "yyyy-MM"), label: format(month, "MMM"), value };
  });
}

export function revenueThisMonth(invoices: Invoice[], now = new Date()): number {
  return invoices
    .filter((inv) => inv.status === "Paid")
    .filter((inv) => inMonth(parseDate(inv.invoice_date), now))
    .reduce((sum, inv) => sum + Number(inv.amount), 0);
}

export function revenuePreviousMonth(invoices: Invoice[], now = new Date()): number {
  return invoices
    .filter((inv) => inv.status === "Paid")
    .filter((inv) => inPreviousMonth(parseDate(inv.invoice_date), now))
    .reduce((sum, inv) => sum + Number(inv.amount), 0);
}

export function bookingsThisMonth(bookings: Booking[], now = new Date()): number {
  return bookings.filter((b) => inMonth(parseDate(b.booking_date), now)).length;
}

export function bookingsPreviousMonth(bookings: Booking[], now = new Date()): number {
  return bookings.filter((b) => inPreviousMonth(parseDate(b.booking_date), now)).length;
}

export function newCustomersThisMonth(customers: Customer[], now = new Date()): number {
  return customers.filter((c) => inMonth(parseDate(c.created_at), now)).length;
}

export function newCustomersPreviousMonth(customers: Customer[], now = new Date()): number {
  return customers.filter((c) => inPreviousMonth(parseDate(c.created_at), now)).length;
}

export function outstandingCount(invoices: Invoice[]): number {
  return invoices.filter((inv) => inv.status === "Unpaid" || inv.status === "Overdue").length;
}

export function outstandingAmount(invoices: Invoice[]): number {
  return invoices
    .filter((inv) => inv.status === "Unpaid" || inv.status === "Overdue")
    .reduce((sum, inv) => sum + Number(inv.amount), 0);
}

export function conversionRate(bookings: Booking[], now = new Date()): number {
  const monthBookings = bookings.filter((b) => inMonth(parseDate(b.booking_date), now));
  if (monthBookings.length === 0) return 0;
  const confirmed = monthBookings.filter((b) => b.status === "Confirmed").length;
  return Math.round((confirmed / monthBookings.length) * 100);
}

export function conversionRatePrevious(bookings: Booking[], now = new Date()): number {
  const monthBookings = bookings.filter((b) => inPreviousMonth(parseDate(b.booking_date), now));
  if (monthBookings.length === 0) return 0;
  const confirmed = monthBookings.filter((b) => b.status === "Confirmed").length;
  return Math.round((confirmed / monthBookings.length) * 100);
}

export function utilizationRate(bookings: Booking[], now = new Date()): number {
  const today = bookings.filter((b) => isSameDay(parseDate(b.booking_date), now));
  if (today.length === 0) return 0;
  const confirmed = today.filter((b) => b.status === "Confirmed").length;
  return Math.round((confirmed / today.length) * 100);
}

function utilizationInInterval(bookings: Booking[], start: Date, end: Date): number {
  const inRange = bookings.filter((b) => {
    const d = parseDate(b.booking_date);
    return isWithinInterval(d, { start, end });
  });
  if (inRange.length === 0) return 0;
  const confirmed = inRange.filter((b) => b.status === "Confirmed").length;
  return Math.round((confirmed / inRange.length) * 100);
}

export function utilizationWeekTrend(bookings: Booking[], now = new Date()): PeriodTrend {
  const thisStart = startOfWeek(now, { weekStartsOn: 1 });
  const thisEnd = endOfWeek(now, { weekStartsOn: 1 });
  const lastStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
  const lastEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
  const current = utilizationInInterval(bookings, thisStart, thisEnd);
  const previous = utilizationInInterval(bookings, lastStart, lastEnd);
  return comparePeriods(current, previous);
}

export function outstandingInvoiceTrend(invoices: Invoice[], now = new Date()): PeriodTrend {
  const isOutstanding = (inv: Invoice) => inv.status === "Unpaid" || inv.status === "Overdue";
  const current = invoices.filter(
    (inv) => isOutstanding(inv) && inMonth(parseDate(inv.invoice_date), now),
  ).length;
  const previous = invoices.filter(
    (inv) => isOutstanding(inv) && inPreviousMonth(parseDate(inv.invoice_date), now),
  ).length;
  return comparePeriods(current, previous);
}

export function todayBookingsList(bookings: Booking[], now = new Date()): Booking[] {
  return bookings
    .filter((b) => isSameDay(parseDate(b.booking_date), now))
    .sort((a, b) => parseDate(a.booking_date).getTime() - parseDate(b.booking_date).getTime());
}

export function pendingBookings(bookings: Booking[]): Booking[] {
  return bookings
    .filter((b) => b.status === "Pending")
    .sort((a, b) => parseDate(b.booking_date).getTime() - parseDate(a.booking_date).getTime());
}

export function waitingCustomersToday(bookings: Booking[], now = new Date()): Booking[] {
  return bookings
    .filter((b) => b.status === "Pending" && isSameDay(parseDate(b.booking_date), now))
    .sort((a, b) => parseDate(a.booking_date).getTime() - parseDate(b.booking_date).getTime());
}

export function missedAppointments(bookings: Booking[], now = new Date()): Booking[] {
  return bookings
    .filter((b) => {
      const d = parseDate(b.booking_date);
      return b.status === "Cancelled" && isSameDay(d, now);
    })
    .sort((a, b) => parseDate(b.booking_date).getTime() - parseDate(a.booking_date).getTime());
}

export function buildActivityTimeline(
  customers: Customer[],
  bookings: Booking[],
  invoices: Invoice[],
  limit = 12,
): ActivityItem[] {
  const items: ActivityItem[] = [
    ...customers.map((c) => ({
      id: `customer-${c.id}`,
      type: "customer" as const,
      title: c.name,
      subtitle: "customer",
      timestamp: c.created_at,
      href: "/customers",
    })),
    ...bookings.map((b) => ({
      id: `booking-${b.id}`,
      type: "booking" as const,
      title: b.customers?.name ?? b.service,
      subtitle: b.status,
      timestamp: b.created_at,
      href: "/operations",
    })),
    ...invoices.map((inv) => ({
      id: `invoice-${inv.id}`,
      type: "invoice" as const,
      title: inv.customers?.name ?? String(inv.amount),
      subtitle: inv.status,
      timestamp: inv.created_at,
      href: "/invoices",
    })),
  ];

  return items
    .sort((a, b) => parseDate(b.timestamp).getTime() - parseDate(a.timestamp).getTime())
    .slice(0, limit);
}

export function deriveAiInsight(
  bookings: Booking[],
  invoices: Invoice[],
  customers: Customer[],
  now = new Date(),
): AiInsightResult {
  const overdue = invoices.filter((inv) => inv.status === "Overdue").length;
  const pending = bookings.filter((b) => b.status === "Pending").length;
  const conversion = conversionRate(bookings, now);
  const prevConversion = conversionRatePrevious(bookings, now);
  const newThisMonth = newCustomersThisMonth(customers, now);
  const newPrev = newCustomersPreviousMonth(customers, now);

  if (overdue > 0) {
    return {
      severity: "warning",
      titleKey: "dashboard.home.executive.aiInsight.overdueTitle",
      bodyKey: "dashboard.home.executive.aiInsight.overdueBody",
      bodyParams: { count: overdue },
    };
  }

  if (pending >= 3) {
    return {
      severity: "warning",
      titleKey: "dashboard.home.executive.aiInsight.pendingTitle",
      bodyKey: "dashboard.home.executive.aiInsight.pendingBody",
      bodyParams: { count: pending },
    };
  }

  if (conversion < prevConversion && prevConversion > 0) {
    return {
      severity: "info",
      titleKey: "dashboard.home.executive.aiInsight.conversionTitle",
      bodyKey: "dashboard.home.executive.aiInsight.conversionBody",
      bodyParams: { current: conversion, previous: prevConversion },
    };
  }

  if (newThisMonth > newPrev) {
    return {
      severity: "success",
      titleKey: "dashboard.home.executive.aiInsight.growthTitle",
      bodyKey: "dashboard.home.executive.aiInsight.growthBody",
      bodyParams: { count: newThisMonth },
    };
  }

  const todayCount = todayBookingsList(bookings, now).length;
  return {
    severity: "info",
    titleKey: "dashboard.home.executive.aiInsight.defaultTitle",
    bodyKey: "dashboard.home.executive.aiInsight.defaultBody",
    bodyParams: { today: todayCount, customers: customers.length },
  };
}

export function derivePrimaryAction(
  pendingCount: number,
  outstanding: number,
  canCreateBooking: boolean,
): "pending" | "outstanding" | "booking" {
  if (pendingCount > 0) return "pending";
  if (outstanding > 0) return "outstanding";
  return canCreateBooking ? "booking" : "pending";
}

export function fmtCurrency(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}
