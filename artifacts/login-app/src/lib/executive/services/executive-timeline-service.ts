import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExecutiveTimelineEvent, ExecutiveDashboardSnapshot } from "@/lib/executive/types";

/** Chronological executive timeline from cross-platform events. */
export class ExecutiveTimelineService {
  constructor(private readonly client: SupabaseClient) {}

  async build(companyId: string, snapshot: ExecutiveDashboardSnapshot): Promise<ExecutiveTimelineEvent[]> {
    const events: ExecutiveTimelineEvent[] = [];

    for (const alert of snapshot.alerts) {
      events.push({
        id: alert.id,
        type: "alert",
        title: alert.title,
        description: alert.message,
        occurredAt: alert.createdAt,
        metadata: { severity: alert.severity, alertType: alert.alertType },
      });
    }

    const { data: payments } = await this.client
      .from("customer_payments")
      .select("id, amount_cents, paid_at, status")
      .eq("company_id", companyId)
      .eq("status", "completed")
      .order("paid_at", { ascending: false })
      .limit(10);

    for (const pay of payments ?? []) {
      events.push({
        id: String(pay.id),
        type: "payment",
        title: "Payment received",
        description: `${Number(pay.amount_cents) / 100} collected`,
        occurredAt: String(pay.paid_at ?? new Date().toISOString()),
        metadata: { amountCents: pay.amount_cents },
      });
    }

    const { data: refunds } = await this.client
      .from("financial_refunds")
      .select("id, amount_cents, created_at, status")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(5);

    for (const ref of refunds ?? []) {
      events.push({
        id: String(ref.id),
        type: "refund",
        title: "Refund processed",
        description: `${Number(ref.amount_cents) / 100} refunded`,
        occurredAt: String(ref.created_at),
        metadata: { status: ref.status },
      });
    }

    const { data: invoices } = await this.client
      .from("invoices")
      .select("id, invoice_number, issued_at, total_cents, status")
      .eq("company_id", companyId)
      .eq("invoice_type", "customer")
      .order("issued_at", { ascending: false })
      .limit(10);

    for (const inv of invoices ?? []) {
      if (!inv.issued_at) continue;
      events.push({
        id: String(inv.id),
        type: "invoice",
        title: `Invoice ${inv.invoice_number ?? inv.id}`,
        description: `Status: ${inv.status}`,
        occurredAt: String(inv.issued_at),
        metadata: { totalCents: inv.total_cents },
      });
    }

    return events.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 50);
  }
}
