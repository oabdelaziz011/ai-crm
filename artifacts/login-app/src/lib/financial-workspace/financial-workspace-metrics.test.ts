import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CustomerInvoice } from "@/lib/billing/types/financial-types";
import { TimezoneResolver } from "@/lib/scheduling/availability-engine/timezone-resolver";
import {
  buildFinancialPeriodReport,
  resolveFinancialReportRange,
} from "./financial-workspace-metrics.ts";

function invoice(patch: Partial<CustomerInvoice>): CustomerInvoice {
  return {
    id: "inv",
    companyId: "co",
    customerId: "cu",
    bookingId: null,
    invoiceNumber: "INV-1",
    status: "paid",
    currency: "EGP",
    subtotalCents: 100,
    taxCents: 0,
    discountCents: 0,
    totalCents: 100,
    paidCents: 100,
    version: 1,
    taxMode: "exclusive",
    branchId: null,
    notes: null,
    issuedAt: "2026-10-13T06:00:00.000Z",
    dueAt: null,
    paidAt: "2026-10-13T06:00:00.000Z",
    cancelledAt: null,
    lineItems: [],
    createdAt: "2026-10-13T06:00:00.000Z",
    updatedAt: "2026-10-13T06:00:00.000Z",
    ...patch,
  };
}

describe("financial period report", () => {
  it("uses the company calendar for today, week, and month", () => {
    const timezone = "Africa/Cairo";
    const today = resolveFinancialReportRange("today", timezone);
    const now = TimezoneResolver.localDateForInstant(new Date(), timezone);
    assert.equal(today.dateFrom, now);
    assert.equal(today.dateTo, now);

    const week = resolveFinancialReportRange("week", timezone);
    assert.equal(TimezoneResolver.weekdayForDate(week.dateFrom, timezone), 1);
    assert.ok(week.dateFrom <= now && now <= week.dateTo);

    const month = resolveFinancialReportRange("month", timezone);
    assert.ok(month.dateFrom.endsWith("-01"));
    assert.ok(month.dateFrom <= now && now <= month.dateTo);
  });

  it("sums total, paid, and remaining for invoices inside a custom range", () => {
    const report = buildFinancialPeriodReport({
      timezone: "Africa/Cairo",
      dateFrom: "2026-10-13",
      dateTo: "2026-10-13",
      bookingCount: 2,
      invoices: [
        invoice({ id: "a", totalCents: 100, paidCents: 40, status: "partially_paid" }),
        invoice({
          id: "b",
          totalCents: 5000,
          paidCents: 0,
          status: "issued",
          issuedAt: "2026-10-12T06:00:00.000Z",
          createdAt: "2026-10-12T06:00:00.000Z",
        }),
        invoice({ id: "c", totalCents: 900, paidCents: 900, status: "cancelled" }),
      ],
    });

    assert.equal(report.invoiceCount, 1);
    assert.equal(report.totalCents, 100);
    assert.equal(report.paidCents, 40);
    assert.equal(report.remainingCents, 60);
    assert.equal(report.bookingCount, 2);
  });
});
