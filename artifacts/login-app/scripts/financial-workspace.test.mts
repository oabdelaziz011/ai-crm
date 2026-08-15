/**
 * Unified Financial Workspace — metrics, nav merge, redirects, payment wiring.
 * Run: npx --yes tsx --test scripts/financial-workspace.test.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildCustomerFinancialAccounts,
  buildFinancialWorkspaceKpis,
  buildInvoicePaymentMonthSeries,
  buildInvoiceStatusSlices,
  buildPaymentStatusSlices,
  isInvoiceOverdue,
  remainingInvoiceCents,
} from "../src/lib/financial-workspace/financial-workspace-metrics.ts";
import type { CustomerInvoice, CustomerPayment } from "../src/lib/billing/types/financial-types.ts";
import { DASHBOARD_ROUTE_REGISTRY, DASHBOARD_SIDEBAR_ORDER } from "../src/config/dashboard-route-registry.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function inv(partial: Partial<CustomerInvoice> & Pick<CustomerInvoice, "id" | "status" | "totalCents" | "paidCents">): CustomerInvoice {
  return {
    companyId: "co-1",
    customerId: "cu-1",
    bookingId: null,
    invoiceNumber: "INV-1",
    currency: "SAR",
    subtotalCents: partial.totalCents,
    taxCents: 0,
    discountCents: 0,
    version: 1,
    taxMode: "exclusive",
    branchId: null,
    notes: null,
    issuedAt: "2026-01-15T00:00:00.000Z",
    dueAt: "2026-01-01T00:00:00.000Z",
    paidAt: null,
    cancelledAt: null,
    lineItems: [],
    createdAt: "2026-01-15T00:00:00.000Z",
    updatedAt: "2026-01-15T00:00:00.000Z",
    ...partial,
  };
}

function pay(partial: Partial<CustomerPayment> & Pick<CustomerPayment, "id" | "status" | "amountCents">): CustomerPayment {
  return {
    companyId: "co-1",
    invoiceId: "inv-1",
    customerId: "cu-1",
    paymentMethod: "cash",
    providerCode: null,
    currency: "SAR",
    paidAt: "2026-02-01T00:00:00.000Z",
    createdAt: "2026-02-01T00:00:00.000Z",
    ...partial,
  };
}

describe("financial workspace navigation", () => {
  it("exposes a single sidebar entry for invoices (financial hidden)", () => {
    const sidebarIds = DASHBOARD_SIDEBAR_ORDER.filter((e) => e.type === "route").map((e) => e.id);
    assert.ok(sidebarIds.includes("invoices"));
    assert.ok(!sidebarIds.includes("financial"));
  });

  it("keeps /financial route for deep links with same workspace title", () => {
    const invoices = DASHBOARD_ROUTE_REGISTRY.find((r) => r.id === "invoices");
    const financial = DASHBOARD_ROUTE_REGISTRY.find((r) => r.id === "financial");
    assert.ok(invoices);
    assert.ok(financial);
    assert.equal(invoices!.titleKey, "navigation.financialWorkspace");
    assert.equal(financial!.titleKey, "navigation.financialWorkspace");
    assert.equal(invoices!.permission, "invoices.view");
    assert.equal(financial!.permission, "invoices.view");
  });

  it("financial billing page redirects into invoices workspace", () => {
    const src = readFileSync(
      join(root, "src/pages/dashboard/financial/financial-billing-dashboard-page.tsx"),
      "utf8",
    );
    assert.match(src, /setLocation\("\/invoices\?tab=overview"\)/);
    assert.match(src, /FinancialWorkspace/);
  });

  it("invoices page mounts FinancialWorkspace", () => {
    const src = readFileSync(join(root, "src/pages/dashboard/invoices-page.tsx"), "utf8");
    assert.match(src, /FinancialWorkspace/);
  });
});

describe("financial workspace metrics", () => {
  it("computes due, overdue, remaining, and collection from real rows", () => {
    const invoices = [
      inv({ id: "a", status: "issued", totalCents: 10_000, paidCents: 0, dueAt: "2020-01-01T00:00:00.000Z" }),
      inv({ id: "b", status: "partially_paid", totalCents: 20_000, paidCents: 5_000, dueAt: "2099-01-01T00:00:00.000Z" }),
      inv({ id: "c", status: "paid", totalCents: 5_000, paidCents: 5_000 }),
    ];
    const payments = [
      pay({ id: "p1", status: "completed", amountCents: 5_000 }),
      pay({ id: "p2", status: "pending", amountCents: 1_000 }),
    ];
    assert.equal(remainingInvoiceCents(invoices[0]!), 10_000);
    assert.equal(isInvoiceOverdue(invoices[0]!), true);
    assert.equal(isInvoiceOverdue(invoices[1]!), false);
    assert.equal(isInvoiceOverdue(invoices[2]!), false);

    const kpis = buildFinancialWorkspaceKpis({
      metrics: null,
      invoices,
      payments,
      currency: "SAR",
    });
    const byId = Object.fromEntries(kpis.map((k) => [k.id, k]));
    assert.equal(byId.invoiceCount?.valueNumber, 3);
    assert.equal(byId.billed?.valueCents, 35_000);
    assert.equal(byId.paid?.valueCents, 10_000);
    assert.equal(byId.due?.valueCents, 25_000);
    assert.equal(byId.overdue?.valueCents, 10_000);
    assert.equal(byId.collection?.valueNumber, 28.6);
  });

  it("builds status slices and month series without inventing data", () => {
    const invoices = [
      inv({ id: "a", status: "paid", totalCents: 100, paidCents: 100 }),
      inv({ id: "b", status: "paid", totalCents: 200, paidCents: 200 }),
      inv({ id: "c", status: "draft", totalCents: 50, paidCents: 0 }),
    ];
    const payments = [pay({ id: "p1", status: "completed", amountCents: 100 })];
    const invSlices = buildInvoiceStatusSlices(invoices);
    assert.equal(invSlices.find((s) => s.id === "paid")?.value, 2);
    assert.equal(invSlices.find((s) => s.id === "draft")?.value, 1);
    const paySlices = buildPaymentStatusSlices(payments);
    assert.equal(paySlices[0]?.id, "completed");
    const series = buildInvoicePaymentMonthSeries(invoices, payments);
    assert.equal(series.length, 6);
  });

  it("aggregates customer financial accounts from invoices", () => {
    const invoices = [
      inv({ id: "a", customerId: "cu-1", status: "issued", totalCents: 1000, paidCents: 0 }),
      inv({ id: "b", customerId: "cu-2", status: "paid", totalCents: 500, paidCents: 500 }),
    ];
    const accounts = buildCustomerFinancialAccounts({
      invoices,
      payments: [],
      customerNameById: new Map([["cu-1", "Alice"], ["cu-2", "Bob"]]),
      currency: "SAR",
    });
    assert.equal(accounts[0]?.customerName, "Alice");
    assert.equal(accounts[0]?.dueCents, 1000);
    assert.equal(accounts.find((a) => a.customerId === "cu-2")?.paidCents, 500);
  });
});

describe("manual payment wiring", () => {
  it("records via repository create + PaymentService.confirmPayment (no direct completed insert)", () => {
    const src = readFileSync(join(root, "src/lib/financial-workspace/record-manual-payment.ts"), "utf8");
    assert.match(src, /CustomerPaymentRepository/);
    assert.match(src, /confirmPayment/);
    assert.doesNotMatch(src, /status:\s*"completed"/);
    assert.doesNotMatch(src, /billing_payments|billing_invoices|billing_receipts/);
  });

  it("confirmPayment publishes PaymentCollected with customerId + method", () => {
    const src = readFileSync(join(root, "src/lib/billing/payments/payment-service.ts"), "utf8");
    assert.match(src, /customerId,\s*\n\s*amountCents:/);
    assert.match(src, /method:\s*payment\.paymentMethod/);
    assert.match(src, /paidAt:/);
    assert.match(src, /platform event publish failed after payment confirmation/);
  });

  it("workspace does not touch SaaS billing tables", () => {
    const src = readFileSync(
      join(root, "src/components/financial-workspace/financial-workspace.tsx"),
      "utf8",
    );
    assert.doesNotMatch(src, /billing_invoices|billing_payments|billing_receipts|saas/);
    assert.match(src, /recordManualCustomerPayment/);
    assert.match(src, /invoices\.create/);
    assert.match(src, /invoices\.edit/);
    assert.match(src, /paymentNeedsCustomer/);
  });
});

describe("localization", () => {
  it("includes financialWorkspace keys in AR and EN", () => {
    const en = JSON.parse(readFileSync(join(root, "src/locales/en/common.json"), "utf8"));
    const ar = JSON.parse(readFileSync(join(root, "src/locales/ar/common.json"), "utf8"));
    assert.equal(en.navigation.financialWorkspace, "Invoices & Financial Billing");
    assert.equal(ar.navigation.financialWorkspace, "الفواتير والفوترة المالية");
    assert.equal(en.financialWorkspace.title, "Invoices & Financial Billing");
    assert.equal(ar.financialWorkspace.title, "الفواتير والفوترة المالية");
    assert.ok(en.financialWorkspace.tabs.overview);
    assert.ok(ar.financialWorkspace.tabs.overview);
    assert.ok(en.financialWorkspace.kpis.billed);
    assert.ok(ar.financialWorkspace.kpis.billed);
  });
});
