import type { CustomerInvoice, CustomerPayment, RevenueMetrics } from "@/lib/billing/types/financial-types";

export type FinancialWorkspaceKpi = {
  id: string;
  labelKey: string;
  valueCents: number;
  currency?: string;
  format: "money" | "number" | "percent";
  valueNumber?: number;
  icon: "invoices" | "billed" | "paid" | "due" | "overdue" | "collection" | "average";
};

export type FinancialStatusSlice = {
  id: string;
  labelKey: string;
  value: number;
  color: string;
};

export type FinancialMonthPoint = {
  label: string;
  invoicedCents: number;
  paidCents: number;
};

export type CustomerFinancialAccount = {
  customerId: string;
  customerName: string;
  invoiceCount: number;
  billedCents: number;
  paidCents: number;
  dueCents: number;
  overdueCents: number;
  lastActivityAt: string | null;
  currency: string;
};

function remainingCents(inv: CustomerInvoice): number {
  return Math.max(0, Number(inv.totalCents || 0) - Number(inv.paidCents || 0));
}

export function isInvoiceOpen(inv: CustomerInvoice): boolean {
  return !["paid", "cancelled", "refunded"].includes(inv.status);
}

export function isInvoiceOverdue(inv: CustomerInvoice, now = new Date()): boolean {
  if (!isInvoiceOpen(inv)) return false;
  if (remainingCents(inv) <= 0) return false;
  if (!inv.dueAt) return false;
  return new Date(inv.dueAt).getTime() < now.getTime();
}

export function buildFinancialWorkspaceKpis(input: {
  metrics: RevenueMetrics | null | undefined;
  invoices: CustomerInvoice[];
  payments: CustomerPayment[];
  currency: string;
}): FinancialWorkspaceKpi[] {
  const invoices = input.invoices;
  const payments = input.payments.filter((p) => p.status === "completed");
  const billedCents = invoices.reduce((s, i) => s + Number(i.totalCents || 0), 0);
  const paidFromInvoices = invoices.reduce((s, i) => s + Number(i.paidCents || 0), 0);
  const paidFromPayments = payments.reduce((s, p) => s + Number(p.amountCents || 0), 0);
  const paidCents = Math.max(paidFromInvoices, paidFromPayments);
  const dueCents =
    input.metrics?.outstandingCents ??
    invoices.filter(isInvoiceOpen).reduce((s, i) => s + remainingCents(i), 0);
  const overdueCents = invoices
    .filter((i) => isInvoiceOverdue(i))
    .reduce((s, i) => s + remainingCents(i), 0);
  const collectionRate =
    billedCents > 0 ? Math.round((paidCents / billedCents) * 1000) / 10 : null;

  const kpis: FinancialWorkspaceKpi[] = [
    {
      id: "invoiceCount",
      labelKey: "financialWorkspace.kpis.invoiceCount",
      valueCents: 0,
      valueNumber: input.metrics?.invoiceCount ?? invoices.length,
      format: "number",
      icon: "invoices",
    },
    {
      id: "billed",
      labelKey: "financialWorkspace.kpis.billed",
      valueCents: billedCents,
      currency: input.currency,
      format: "money",
      icon: "billed",
    },
    {
      id: "paid",
      labelKey: "financialWorkspace.kpis.paid",
      valueCents: paidCents,
      currency: input.currency,
      format: "money",
      icon: "paid",
    },
    {
      id: "due",
      labelKey: "financialWorkspace.kpis.due",
      valueCents: dueCents,
      currency: input.currency,
      format: "money",
      icon: "due",
    },
    {
      id: "overdue",
      labelKey: "financialWorkspace.kpis.overdue",
      valueCents: overdueCents,
      currency: input.currency,
      format: "money",
      icon: "overdue",
    },
  ];

  if (collectionRate != null) {
    kpis.push({
      id: "collection",
      labelKey: "financialWorkspace.kpis.collectionRate",
      valueCents: 0,
      valueNumber: collectionRate,
      format: "percent",
      icon: "collection",
    });
  }

  const metricsAvg = input.metrics?.averageInvoiceCents ?? 0;
  const avg =
    metricsAvg > 0
      ? metricsAvg
      : invoices.length > 0
        ? Math.round(billedCents / invoices.length)
        : 0;
  if (avg > 0) {
    kpis.push({
      id: "average",
      labelKey: "financialWorkspace.kpis.averageInvoice",
      valueCents: avg,
      currency: input.currency,
      format: "money",
      icon: "average",
    });
  }

  return kpis;
}

export function buildInvoiceStatusSlices(invoices: CustomerInvoice[]): FinancialStatusSlice[] {
  const map = new Map<string, number>();
  for (const inv of invoices) {
    map.set(inv.status, (map.get(inv.status) ?? 0) + 1);
  }
  const colors: Record<string, string> = {
    paid: "bg-emerald-500",
    partially_paid: "bg-sky-500",
    issued: "bg-amber-500",
    pending: "bg-amber-400",
    draft: "bg-slate-400",
    cancelled: "bg-slate-500",
    refunded: "bg-violet-500",
  };
  return [...map.entries()]
    .map(([id, value]) => ({
      id,
      labelKey: `financialWorkspace.status.invoice.${id}`,
      value,
      color: colors[id] ?? "bg-primary/70",
    }))
    .sort((a, b) => b.value - a.value);
}

export function buildPaymentStatusSlices(payments: CustomerPayment[]): FinancialStatusSlice[] {
  const map = new Map<string, number>();
  for (const pay of payments) {
    map.set(pay.status, (map.get(pay.status) ?? 0) + 1);
  }
  const colors: Record<string, string> = {
    completed: "bg-emerald-500",
    pending: "bg-amber-500",
    processing: "bg-sky-500",
    failed: "bg-rose-500",
    refunded: "bg-violet-500",
    partially_refunded: "bg-violet-400",
  };
  return [...map.entries()]
    .map(([id, value]) => ({
      id,
      labelKey: `financialWorkspace.status.payment.${id}`,
      value,
      color: colors[id] ?? "bg-primary/70",
    }))
    .sort((a, b) => b.value - a.value);
}

export function buildInvoicePaymentMonthSeries(
  invoices: CustomerInvoice[],
  payments: CustomerPayment[],
): FinancialMonthPoint[] {
  const points: FinancialMonthPoint[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const month = d.getMonth();
    const year = d.getFullYear();
    const label = d.toLocaleDateString(undefined, { month: "short" });
    const invoicedCents = invoices
      .filter((inv) => {
        const at = new Date(inv.issuedAt || inv.createdAt);
        return at.getMonth() === month && at.getFullYear() === year;
      })
      .reduce((s, inv) => s + Number(inv.totalCents || 0), 0);
    const paidCents = payments
      .filter((p) => {
        if (p.status !== "completed") return false;
        const at = new Date(p.paidAt || p.createdAt);
        return at.getMonth() === month && at.getFullYear() === year;
      })
      .reduce((s, p) => s + Number(p.amountCents || 0), 0);
    points.push({ label, invoicedCents, paidCents });
  }
  return points;
}

export function buildCustomerFinancialAccounts(input: {
  invoices: CustomerInvoice[];
  payments: CustomerPayment[];
  customerNameById: Map<string, string>;
  currency: string;
}): CustomerFinancialAccount[] {
  const byCustomer = new Map<string, CustomerFinancialAccount>();

  for (const inv of input.invoices) {
    const customerId = inv.customerId ?? "unknown";
    const existing =
      byCustomer.get(customerId) ??
      ({
        customerId,
        customerName:
          input.customerNameById.get(customerId) ??
          (customerId === "unknown" ? "—" : customerId.slice(0, 8)),
        invoiceCount: 0,
        billedCents: 0,
        paidCents: 0,
        dueCents: 0,
        overdueCents: 0,
        lastActivityAt: null,
        currency: inv.currency || input.currency,
      } satisfies CustomerFinancialAccount);

    existing.invoiceCount += 1;
    existing.billedCents += Number(inv.totalCents || 0);
    existing.paidCents += Number(inv.paidCents || 0);
    const rem = remainingCents(inv);
    if (isInvoiceOpen(inv)) existing.dueCents += rem;
    if (isInvoiceOverdue(inv)) existing.overdueCents += rem;
    const at = inv.updatedAt || inv.createdAt;
    if (!existing.lastActivityAt || at > existing.lastActivityAt) existing.lastActivityAt = at;
    byCustomer.set(customerId, existing);
  }

  return [...byCustomer.values()].sort((a, b) => b.dueCents - a.dueCents || b.billedCents - a.billedCents);
}

export function remainingInvoiceCents(inv: CustomerInvoice): number {
  return remainingCents(inv);
}
