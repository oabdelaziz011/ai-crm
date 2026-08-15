import { supabase } from "@/lib/supabase";
import type { TimelineActor, TimelineEvent, TimelineEventProvider, TimelineFetchInput } from "../types";
import { fetchActorNames } from "../provider-utils";

type InvoiceRow = {
  id: string;
  amount: number;
  status: string;
  invoice_date: string;
  created_at: string;
  updated_at: string;
  user_id: string | null;
};

function formatAmount(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function attachActor(
  event: TimelineEvent,
  actorId: string | null | undefined,
  actorNames: Map<string, string>,
): TimelineEvent {
  const id = actorId?.trim() || null;
  const label = id ? actorNames.get(id) ?? null : null;
  const actor: TimelineActor = {
    id,
    label,
    type: label ? "employee" : "system",
  };
  return {
    ...event,
    actor,
    metadata: {
      ...event.metadata,
      actor: label,
      actorId: id,
    },
  };
}

export class InvoicesTimelineProvider implements TimelineEventProvider {
  readonly providerId = "invoices";

  async getEvents({ customerId }: TimelineFetchInput): Promise<TimelineEvent[]> {
    const { data, error } = await supabase
      .from("invoices")
      .select("id, amount, status, invoice_date, created_at, updated_at, user_id")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });

    if (error || !data) return [];

    const rows = data as InvoiceRow[];
    const actorNames = await fetchActorNames(rows.map((row) => row.user_id ?? "").filter(Boolean));
    const events: TimelineEvent[] = [];

    for (const invoice of rows) {
      const amountLabel = formatAmount(Number(invoice.amount));
      const baseMetadata = {
        detail: amountLabel,
        searchText: [amountLabel, invoice.status, "invoice"].join(" "),
        filterGroup: "invoices" as const,
        invoiceId: invoice.id,
      };

      events.push(
        attachActor(
          {
            id: `${this.providerId}:created:${invoice.id}`,
            type: "invoice_created",
            occurredAt: invoice.created_at,
            source: this.providerId,
            payload: { invoiceId: invoice.id, amount: invoice.amount, status: invoice.status },
            metadata: baseMetadata,
          },
          invoice.user_id,
          actorNames,
        ),
      );

      const updatedAfterCreate =
        new Date(invoice.updated_at).getTime() > new Date(invoice.created_at).getTime() + 60_000;

      if (invoice.status === "Paid") {
        const paidAt = updatedAfterCreate ? invoice.updated_at : invoice.created_at;
        events.push(
          attachActor(
            {
              id: `${this.providerId}:paid:${invoice.id}`,
              type: "invoice_paid",
              occurredAt: paidAt,
              source: this.providerId,
              payload: { invoiceId: invoice.id, amount: invoice.amount },
              metadata: baseMetadata,
            },
            invoice.user_id,
            actorNames,
          ),
        );

        if (updatedAfterCreate) {
          events.push(
            attachActor(
              {
                id: `${this.providerId}:payment:${invoice.id}`,
                type: "payment_received",
                occurredAt: invoice.updated_at,
                source: this.providerId,
                payload: { invoiceId: invoice.id, amount: invoice.amount },
                metadata: baseMetadata,
              },
              invoice.user_id,
              actorNames,
            ),
          );
        }
      }

      if (invoice.status === "Overdue") {
        events.push(
          attachActor(
            {
              id: `${this.providerId}:overdue:${invoice.id}`,
              type: "invoice_overdue",
              occurredAt: updatedAfterCreate ? invoice.updated_at : invoice.invoice_date,
              source: this.providerId,
              payload: { invoiceId: invoice.id, amount: invoice.amount },
              metadata: baseMetadata,
            },
            invoice.user_id,
            actorNames,
          ),
        );
      }
    }

    return events;
  }
}
