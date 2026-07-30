import type { Customer360Dto } from "../dto/customer-360-dto.js";

export type RuntimeContextSource = Record<string, unknown>;

export interface Customer360ContextProviderPort {
  readonly key: string;
  resolve(source: RuntimeContextSource): Record<string, unknown>;
}

export class Customer360ContextProvider implements Customer360ContextProviderPort {
  readonly key = "customer360";

  resolve(source: RuntimeContextSource): Record<string, unknown> {
    const customer360 = source.customer360 as Customer360Dto | undefined;
    if (!customer360) {
      return {};
    }

    return {
      customer360,
      customer: {
        id: customer360.customer.id,
        name: customer360.customer.name,
        phone: customer360.customer.phones[0] ?? "",
        email: customer360.customer.emails[0] ?? "",
      },
    };
  }
}

export function formatCustomer360PromptSection(customer360: Customer360Dto): string {
  const lines: string[] = [
    `Customer: ${customer360.customer.name} (${customer360.customer.id})`,
  ];

  if (customer360.customer.emails.length) {
    lines.push(`Emails: ${customer360.customer.emails.join(", ")}`);
  }
  if (customer360.customer.phones.length) {
    lines.push(`Phones: ${customer360.customer.phones.join(", ")}`);
  }

  if (customer360.conversation.current) {
    lines.push(
      `Current channel: ${customer360.conversation.current.channelType} · status ${customer360.conversation.current.status}`,
    );
  }

  if (customer360.bookings.upcoming.length) {
    lines.push(
      `Upcoming bookings: ${customer360.bookings.upcoming
        .slice(0, 3)
        .map((b) => `${b.service ?? "service"} @ ${b.scheduledAt ?? "TBD"}`)
        .join("; ")}`,
    );
  }

  if (customer360.invoices.overdue.length) {
    lines.push(`Overdue invoices: ${customer360.invoices.overdue.length}`);
  } else if (customer360.invoices.unpaid.length) {
    lines.push(`Unpaid invoices: ${customer360.invoices.unpaid.length}`);
  }

  if (customer360.sales.opportunities.length) {
    lines.push(`Open opportunities: ${customer360.sales.opportunities.length}`);
  }

  if (customer360.timeline.length) {
    lines.push("Recent timeline:");
    for (const entry of customer360.timeline.slice(0, 8)) {
      lines.push(`- [${entry.category}] ${entry.title}: ${entry.summary}`);
    }
  }

  return lines.join("\n");
}
