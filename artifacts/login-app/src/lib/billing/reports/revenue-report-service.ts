import type { SupabaseClient } from "@supabase/supabase-js";
import type { RevenueBreakdown, RevenueMetrics } from "@/lib/billing/types/financial-types";

/** Operational revenue reporting engine. */
export class RevenueReportService {
  constructor(private readonly client: SupabaseClient) {}

  async getMetrics(companyId: string): Promise<RevenueMetrics> {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const yearStart = new Date(now.getFullYear(), 0, 1).toISOString();

    const [payments, invoices, refunds] = await Promise.all([
      this.client
        .from("customer_payments")
        .select("amount_cents, created_at, status")
        .eq("company_id", companyId)
        .eq("status", "completed"),
      this.client
        .from("invoices")
        .select("total_cents, paid_cents, status")
        .eq("company_id", companyId)
        .eq("invoice_type", "customer"),
      this.client
        .from("financial_refunds")
        .select("amount_cents, status")
        .eq("company_id", companyId)
        .eq("status", "completed"),
    ]);

    const completedPayments = payments.data ?? [];
    const allInvoices = invoices.data ?? [];
    const completedRefunds = refunds.data ?? [];

    const sumSince = (since: string) =>
      completedPayments
        .filter((p) => String(p.created_at) >= since)
        .reduce((s, p) => s + Number(p.amount_cents), 0);

    const outstandingCents = allInvoices
      .filter((i) => !["paid", "cancelled", "refunded"].includes(String(i.status)))
      .reduce((s, i) => s + Number(i.total_cents) - Number(i.paid_cents ?? 0), 0);

    const refundCents = completedRefunds.reduce((s, r) => s + Number(r.amount_cents), 0);
    const invoiceCount = allInvoices.length;
    const averageInvoiceCents =
      invoiceCount > 0
        ? Math.round(allInvoices.reduce((s, i) => s + Number(i.total_cents), 0) / invoiceCount)
        : 0;

    return {
      dailyCents: sumSince(dayStart),
      monthlyCents: sumSince(monthStart),
      yearlyCents: sumSince(yearStart),
      outstandingCents,
      refundCents,
      averageInvoiceCents,
      invoiceCount,
      paymentCount: completedPayments.length,
    };
  }

  async getBreakdown(companyId: string, dimension: RevenueBreakdown["dimension"]): Promise<RevenueBreakdown> {
    if (dimension === "provider") {
      const { data } = await this.client
        .from("customer_payments")
        .select("provider_code, amount_cents")
        .eq("company_id", companyId)
        .eq("status", "completed");

      const grouped = new Map<string, { amountCents: number; count: number }>();
      for (const row of data ?? []) {
        const key = String(row.provider_code ?? "manual");
        const existing = grouped.get(key) ?? { amountCents: 0, count: 0 };
        grouped.set(key, {
          amountCents: existing.amountCents + Number(row.amount_cents),
          count: existing.count + 1,
        });
      }

      return {
        dimension,
        items: [...grouped.entries()].map(([id, v]) => ({
          id,
          name: id,
          amountCents: v.amountCents,
          count: v.count,
        })),
      };
    }

    if (dimension === "service") {
      const { data } = await this.client
        .from("customer_invoice_line_items")
        .select("service_id, total_cents, scheduling_services(name)")
        .eq("company_id", companyId);

      const grouped = new Map<string, { name: string; amountCents: number; count: number }>();
      for (const row of data ?? []) {
        const serviceId = String(row.service_id ?? "unknown");
        const svc = row.scheduling_services as { name?: string } | { name?: string }[] | null;
        const name = Array.isArray(svc) ? svc[0]?.name ?? serviceId : svc?.name ?? serviceId;
        const existing = grouped.get(serviceId) ?? { name, amountCents: 0, count: 0 };
        grouped.set(serviceId, {
          name,
          amountCents: existing.amountCents + Number(row.total_cents),
          count: existing.count + 1,
        });
      }

      return {
        dimension,
        items: [...grouped.entries()].map(([id, v]) => ({ id, ...v })),
      };
    }

    return { dimension, items: [] };
  }
}
