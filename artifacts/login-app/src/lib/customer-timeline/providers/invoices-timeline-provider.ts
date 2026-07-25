import { supabase } from "@/lib/supabase";
import type { TimelineEvent, TimelineEventProvider, TimelineFetchInput } from "../types";

type InvoiceRow = {
  id: string;
  amount: number;
  status: string;
  invoice_date: string;
  created_at: string;
  updated_at: string;
};

function formatAmount(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

export class InvoicesTimelineProvider implements TimelineEventProvider {
  readonly providerId = "invoices";

  async getEvents({ customerId }: TimelineFetchInput): Promise<TimelineEvent[]> {
    const { data, error } = await supabase
      .from("invoices")
      .select("id, amount, status, invoice_date, created_at, updated_at")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });

    if (error || !data) return [];

    const events: TimelineEvent[] = [];

    for (const invoice of data as InvoiceRow[]) {
      const amountLabel = formatAmount(Number(invoice.amount));
      const baseMetadata = {
        detail: amountLabel,
        searchText: [amountLabel, invoice.status, "invoice"].join(" "),
        filterGroup: "invoices" as const,
        invoiceId: invoice.id,
      };

      events.push({
        id: `${this.providerId}:created:${invoice.id}`,
        type: "invoice_created",
        occurredAt: invoice.created_at,
        source: this.providerId,
        payload: { invoiceId: invoice.id, amount: invoice.amount, status: invoice.status },
        metadata: baseMetadata,
      });

      const updatedAfterCreate =
        new Date(invoice.updated_at).getTime() > new Date(invoice.created_at).getTime() + 60_000;

      if (invoice.status === "Paid") {
        const paidAt = updatedAfterCreate ? invoice.updated_at : invoice.created_at;
        events.push({
          id: `${this.providerId}:paid:${invoice.id}`,
          type: "invoice_paid",
          occurredAt: paidAt,
          source: this.providerId,
          payload: { invoiceId: invoice.id, amount: invoice.amount },
          metadata: baseMetadata,
        });

        if (updatedAfterCreate) {
          events.push({
            id: `${this.providerId}:payment:${invoice.id}`,
            type: "payment_received",
            occurredAt: invoice.updated_at,
            source: this.providerId,
            payload: { invoiceId: invoice.id, amount: invoice.amount },
            metadata: baseMetadata,
          });
        }
      }

      if (invoice.status === "Overdue") {
        events.push({
          id: `${this.providerId}:overdue:${invoice.id}`,
          type: "invoice_overdue",
          occurredAt: updatedAfterCreate ? invoice.updated_at : invoice.invoice_date,
          source: this.providerId,
          payload: { invoiceId: invoice.id, amount: invoice.amount },
          metadata: baseMetadata,
        });
      }
    }

    return events;
  }
}
