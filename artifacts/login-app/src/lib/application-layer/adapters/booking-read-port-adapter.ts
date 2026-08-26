import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingReadPort, BookingReadModel } from "@workspace/application-layer";
import { OperationsRepository } from "@/lib/scheduling/operations/repositories";
import { mapRecordToOperationsBooking } from "@/lib/scheduling/operations/selectors";
import {
  getCalendarToday,
  resolveQueueTimezone,
} from "@/lib/scheduling/operations/utilities/calendar-day-range";
import { CustomerInvoiceRepository } from "@/lib/billing/repositories/customer-invoice-repository";
import type { LoginAppPortContext } from "./customer-read-port-adapter.js";

function resolvePaymentStatus(
  status: string,
  outstandingCents: number,
  paidCents: number,
): string {
  if (status === "completed") return "paid";
  if (outstandingCents <= 0 && paidCents > 0) return "paid";
  if (paidCents > 0 && outstandingCents > 0) return "partial";
  return "unpaid";
}

async function loadOutstandingByCustomer(
  client: SupabaseClient,
  companyId: string,
  customerIds: string[],
): Promise<Map<string, { outstandingCents: number; paidCents: number }>> {
  const result = new Map<string, { outstandingCents: number; paidCents: number }>();
  if (customerIds.length === 0) return result;

  const repo = new CustomerInvoiceRepository(client);
  const invoices = await repo.listByCompany(companyId, 500);

  for (const customerId of customerIds) {
    const customerInvoices = invoices.filter((inv) => inv.customerId === customerId);
    const outstandingCents = customerInvoices.reduce((sum, inv) => {
      const normalized = String(inv.status).toLowerCase();
      if (["paid", "completed", "settled", "cancelled"].includes(normalized)) return sum;
      return sum + Math.max(0, inv.totalCents - inv.paidCents);
    }, 0);
    const paidCents = customerInvoices.reduce((sum, inv) => sum + inv.paidCents, 0);
    result.set(customerId, { outstandingCents, paidCents });
  }

  return result;
}

function mapBookingViewToReadModel(
  booking: ReturnType<typeof mapRecordToOperationsBooking>,
  tenantId: string,
  payment: { outstandingCents: number; paidCents: number },
): BookingReadModel {
  const bookingPayment = String(booking.paymentStatus ?? "").toLowerCase();
  const paymentStatus =
    bookingPayment === "paid" ||
    bookingPayment === "partial" ||
    bookingPayment === "pending" ||
    bookingPayment === "refunded" ||
    bookingPayment === "cancelled"
      ? bookingPayment
      : resolvePaymentStatus(booking.status, payment.outstandingCents, payment.paidCents);

  return Object.freeze({
    id: booking.id,
    tenantId,
    customerId: booking.customerId ?? "",
    customerName: booking.customer?.name ?? "Customer",
    reference:
      booking.confirmationNumber?.trim() || "—",
    scheduledAt: booking.startAt,
    status: booking.status,
    paymentStatus,
    employeeId: booking.resourceId ?? undefined,
    employeeName: booking.resource?.name ?? undefined,
    roomId: booking.branchId ?? undefined,
    serviceName: booking.service?.name ?? undefined,
    // Prefer booking price snapshot — never recompute from live service in the table.
    amountCents: booking.amountCents ?? booking.service?.priceCents ?? 0,
    currency: booking.currency || booking.service?.currency || "USD",
    phone: booking.customer?.phone ?? null,
    durationMinutes: booking.durationMinutes,
    branchName: booking.branch?.name ?? undefined,
    visitType: booking.visitType ?? "Unknown",
    discountCents: booking.discountCents ?? 0,
    taxCents: booking.taxCents ?? 0,
  });
}

async function resolveCompanyTimezone(
  client: SupabaseClient,
  companyId: string,
  preferredTimezone?: string | null,
): Promise<string> {
  if (preferredTimezone) {
    return resolveQueueTimezone(preferredTimezone);
  }
  const { data } = await client
    .from("scheduling_booking_rules")
    .select("timezone")
    .eq("company_id", companyId)
    .maybeSingle();
  return resolveQueueTimezone(data?.timezone ?? null);
}

export function createLoginAppBookingReadPort(
  client: SupabaseClient,
  ctx: LoginAppPortContext,
): BookingReadPort {
  const operationsRepo = new OperationsRepository(client);

  async function loadTodayBookings(tenantId: string, timezone: string) {
    const date = getCalendarToday(timezone);
    const records = await operationsRepo.listBookingsForDay({
      companyId: tenantId,
      date,
      timezone,
    });
    return records.map((record) => mapRecordToOperationsBooking(record));
  }

  async function loadBookingsForDateRange(
    tenantId: string,
    dateFrom: string,
    dateTo: string,
    timezone: string,
  ) {
    const records = await operationsRepo.listBookingsForDateRange({
      companyId: tenantId,
      dateFrom,
      dateTo,
      timezone,
    });
    return records.map((record) => mapRecordToOperationsBooking(record));
  }

  return {
    async getById(tenantId, bookingId) {
      if (tenantId !== ctx.companyId || !ctx.hasPermission("bookings.view")) return null;
      const record = await operationsRepo.getBookingById(tenantId, bookingId);
      if (!record) return null;
      const booking = mapRecordToOperationsBooking(record);
      const paymentMap = await loadOutstandingByCustomer(client, tenantId, booking.customerId ? [booking.customerId] : []);
      const payment = paymentMap.get(booking.customerId ?? "") ?? { outstandingCents: 0, paidCents: 0 };
      return mapBookingViewToReadModel(booking, tenantId, payment);
    },

    async listQueue(tenantId, filter) {
      if (tenantId !== ctx.companyId || !ctx.hasPermission("bookings.view")) return [];

      const timezone = await resolveCompanyTimezone(
        client,
        tenantId,
        typeof filter.timezone === "string" ? filter.timezone : null,
      );

      const dateFrom =
        typeof filter.dateFrom === "string" && filter.dateFrom.trim()
          ? filter.dateFrom.trim().slice(0, 10)
          : null;
      const dateTo =
        typeof filter.dateTo === "string" && filter.dateTo.trim()
          ? filter.dateTo.trim().slice(0, 10)
          : dateFrom;

      const bookings =
        dateFrom && dateTo
          ? await loadBookingsForDateRange(tenantId, dateFrom, dateTo, timezone)
          : await loadTodayBookings(tenantId, timezone);
      const customerIds = [...new Set(bookings.map((b) => b.customerId).filter(Boolean))] as string[];
      const paymentMap = await loadOutstandingByCustomer(client, tenantId, customerIds);

      let rows = bookings.map((booking) =>
        mapBookingViewToReadModel(
          booking,
          tenantId,
          paymentMap.get(booking.customerId ?? "") ?? { outstandingCents: 0, paidCents: 0 },
        ),
      );

      if (filter.search) {
        const q = filter.search.toLowerCase();
        rows = rows.filter(
          (row) =>
            row.customerName.toLowerCase().includes(q) ||
            row.reference.toLowerCase().includes(q) ||
            (row.serviceName ?? "").toLowerCase().includes(q),
        );
      }

      if (filter.statusFilter) {
        rows = rows.filter((row) => row.status.toLowerCase() === filter.statusFilter!.toLowerCase());
      }

      return rows;
    },

    async listCalendar(tenantId, from, to, employeeId) {
      if (tenantId !== ctx.companyId || !ctx.hasPermission("bookings.view")) return [];
      const timezone = await resolveCompanyTimezone(client, tenantId);
      const fromDate = from.slice(0, 10);
      const toDate = to.slice(0, 10);

      const allRecords = await operationsRepo.listBookingsForDateRange({
        companyId: tenantId,
        dateFrom: fromDate,
        dateTo: toDate,
        timezone,
      });

      const bookings = allRecords.map((record) => mapRecordToOperationsBooking(record));
      return bookings
        .filter((booking) => {
          const ts = new Date(booking.startAt).getTime();
          if (ts < new Date(from).getTime() || ts > new Date(to).getTime()) return false;
          if (employeeId && booking.resourceId !== employeeId) return false;
          return true;
        })
        .map((booking) =>
          mapBookingViewToReadModel(booking, tenantId, { outstandingCents: 0, paidCents: 0 }),
        );
    },

    async listForCustomer(tenantId, customerId) {
      if (tenantId !== ctx.companyId || !ctx.hasPermission("bookings.view")) return [];
      const timezone = await resolveCompanyTimezone(client, tenantId);
      const bookings = await loadTodayBookings(tenantId, timezone);
      const paymentMap = await loadOutstandingByCustomer(client, tenantId, [customerId]);
      const payment = paymentMap.get(customerId) ?? { outstandingCents: 0, paidCents: 0 };
      return bookings
        .filter((booking) => booking.customerId === customerId)
        .map((booking) => mapBookingViewToReadModel(booking, tenantId, payment));
    },
  };
}
