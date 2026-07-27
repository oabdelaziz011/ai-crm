import { isAfter, isBefore, parseISO, startOfDay } from "date-fns";
import type {
  CustomerListFilters,
  CustomerSavedView,
  CustomerSortField,
  EnrichedCustomerRow,
  SortDirection,
} from "./types";

function matchesSearch(row: EnrichedCustomerRow, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  const { customer } = row;
  return (
    customer.name.toLowerCase().includes(q)
    || (customer.email ?? "").toLowerCase().includes(q)
    || (customer.phone ?? "").toLowerCase().includes(q)
    || (row.company ?? "").toLowerCase().includes(q)
    || (customer.notes ?? "").toLowerCase().includes(q)
    || row.tags.some((tag) => tag.toLowerCase().includes(q))
  );
}

function inDateRange(value: string | null, from: string | null, to: string | null): boolean {
  if (!from && !to) return true;
  if (!value) return false;
  const date = parseISO(value);
  if (from && isBefore(date, startOfDay(parseISO(from)))) return false;
  if (to && isAfter(date, startOfDay(parseISO(to)))) return false;
  return true;
}

export function applyCustomerFilters(
  rows: EnrichedCustomerRow[],
  filters: CustomerListFilters,
  search: string,
): EnrichedCustomerRow[] {
  return rows.filter((row) => {
    if (!matchesSearch(row, search)) return false;

    if (filters.status !== "all" && row.status !== filters.status) return false;
    if (filters.vip === true && !row.isVip) return false;
    if (filters.vip === false && row.isVip) return false;

    if (filters.gender !== "all") {
      const gender = (row.customer.gender ?? "").toLowerCase();
      if (gender !== filters.gender.toLowerCase()) return false;
    }

    if (filters.source !== "all" && row.source !== filters.source) return false;

    if (filters.ageMin != null && (row.customer.age == null || row.customer.age < filters.ageMin)) {
      return false;
    }
    if (filters.ageMax != null && (row.customer.age == null || row.customer.age > filters.ageMax)) {
      return false;
    }

    if (filters.tags.length > 0 && !filters.tags.every((tag) => row.tags.includes(tag))) {
      return false;
    }

    if (filters.outstandingMin != null && row.outstanding < filters.outstandingMin) return false;
    if (filters.outstandingMax != null && row.outstanding > filters.outstandingMax) return false;

    if (!inDateRange(row.lastVisit?.booking_date ?? null, filters.lastVisitFrom, filters.lastVisitTo)) {
      return false;
    }

    if (!inDateRange(row.customer.created_at, filters.registeredFrom, filters.registeredTo)) {
      return false;
    }

    if (
      !inDateRange(
        row.nextAppointment?.booking_date ?? null,
        filters.appointmentFrom,
        filters.appointmentTo,
      )
    ) {
      return false;
    }

    return true;
  });
}

function sortValue(row: EnrichedCustomerRow, field: CustomerSortField): string | number {
  switch (field) {
    case "name":
      return row.customer.name.toLowerCase();
    case "company":
      return (row.company ?? "").toLowerCase();
    case "created_at":
      return parseISO(row.customer.created_at).getTime();
    case "ltv":
      return row.ltv;
    case "outstanding":
      return row.outstanding;
    case "lastActivity":
      return row.lastActivity ? parseISO(row.lastActivity).getTime() : 0;
    case "nextAppointment":
      return row.nextAppointment
        ? parseISO(row.nextAppointment.booking_date).getTime()
        : Number.MAX_SAFE_INTEGER;
    default:
      return row.customer.name.toLowerCase();
  }
}

export function sortCustomerRows(
  rows: EnrichedCustomerRow[],
  field: CustomerSortField,
  direction: SortDirection,
): EnrichedCustomerRow[] {
  const sorted = [...rows].sort((a, b) => {
    const av = sortValue(a, field);
    const bv = sortValue(b, field);
    if (typeof av === "number" && typeof bv === "number") return av - bv;
    return String(av).localeCompare(String(bv));
  });
  return direction === "desc" ? sorted.reverse() : sorted;
}

export function applySavedViewPreset(
  rows: EnrichedCustomerRow[],
  view: CustomerSavedView,
): EnrichedCustomerRow[] {
  switch (view.id) {
    case "vip":
      return rows.filter((row) => row.isVip);
    case "need-follow-up":
      return rows.filter((row) => row.needsFollowUp);
    case "outstanding-payments":
      return rows.filter((row) => row.outstanding > 0);
    case "todays-appointments":
      return rows.filter((row) => row.hasAppointmentToday);
    case "inactive":
      return rows.filter((row) => row.status === "inactive");
    default:
      return rows;
  }
}

export function computeListStats(rows: EnrichedCustomerRow[]) {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  const newThisMonth = rows.filter((row) => {
    const d = parseISO(row.customer.created_at);
    return d.getMonth() === month && d.getFullYear() === year;
  }).length;

  const active = rows.filter((row) => row.status === "active").length;
  const vip = rows.filter((row) => row.isVip).length;
  const outstanding = rows.reduce((sum, row) => sum + row.outstanding, 0);
  const appointmentsToday = rows.filter((row) => row.hasAppointmentToday).length;
  const revenue = rows.reduce((sum, row) => sum + row.ltv, 0);

  const prevMonthRows = rows.filter((row) => {
    const d = parseISO(row.customer.created_at);
    const prev = new Date(year, month - 1, 1);
    return d.getMonth() === prev.getMonth() && d.getFullYear() === prev.getFullYear();
  }).length;

  const growth = prevMonthRows === 0
    ? (newThisMonth > 0 ? 100 : 0)
    : Math.round(((newThisMonth - prevMonthRows) / prevMonthRows) * 100);

  return {
    total: rows.length,
    active,
    vip,
    newThisMonth,
    outstanding,
    appointmentsToday,
    revenue,
    monthlyGrowth: growth,
  };
}

export type StatFilterKey =
  | "all"
  | "active"
  | "vip"
  | "newThisMonth"
  | "outstanding"
  | "appointmentsToday"
  | "revenue";

export function applyStatFilter(
  rows: EnrichedCustomerRow[],
  key: StatFilterKey | null,
): EnrichedCustomerRow[] {
  if (!key || key === "all") return rows;
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  switch (key) {
    case "active":
      return rows.filter((row) => row.status === "active");
    case "vip":
      return rows.filter((row) => row.isVip);
    case "newThisMonth":
      return rows.filter((row) => {
        const d = parseISO(row.customer.created_at);
        return d.getMonth() === month && d.getFullYear() === year;
      });
    case "outstanding":
      return rows.filter((row) => row.outstanding > 0);
    case "appointmentsToday":
      return rows.filter((row) => row.hasAppointmentToday);
    case "revenue":
      return [...rows].sort((a, b) => b.ltv - a.ltv);
    default:
      return rows;
  }
}
