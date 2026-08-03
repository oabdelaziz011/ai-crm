import type { Customer360Dto } from "../dto/customer-360-dto.js";
import { Customer360Cache } from "../cache/customer-360-cache.js";
import { Customer360TimelineBuilder } from "../timeline/customer-360-timeline-builder.js";
import type {
  Customer360AccessContext,
  Customer360DataPort,
  Customer360FetchInput,
} from "../ports/customer-360-data-port.js";

export type Customer360AggregatorOptions = {
  dataPort: Customer360DataPort;
  cache?: Customer360Cache;
};

export class Customer360Aggregator {
  private readonly dataPort: Customer360DataPort;
  private readonly cache: Customer360Cache;
  private readonly timelineBuilder = new Customer360TimelineBuilder();

  constructor(options: Customer360AggregatorOptions) {
    this.dataPort = options.dataPort;
    this.cache = options.cache ?? new Customer360Cache();
  }

  async build(
    access: Customer360AccessContext,
    input: Customer360FetchInput,
  ): Promise<Customer360Dto | null> {
    const cacheKey = this.cache.buildKey({
      companyId: input.companyId,
      customerId: input.customerId,
      actorUserId: access.actorUserId,
    });

    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const bundle = await this.dataPort.fetchBundle(access, input);
    if (!bundle) return null;

    const allBookings = [
      ...bundle.bookings.upcoming,
      ...bundle.bookings.completed,
      ...bundle.bookings.cancelled,
    ];
    const allInvoices = [...bundle.invoices.unpaid, ...bundle.invoices.overdue, ...bundle.invoices.paid];

    const dto: Customer360Dto = {
      version: "1",
      customerId: input.customerId,
      companyId: input.companyId,
      generatedAt: new Date().toISOString(),
      customer: bundle.profile,
      conversation: {
        current: bundle.currentConversation,
        previous: bundle.previousConversations,
      },
      sales: {
        opportunities: bundle.opportunities,
      },
      bookings: bundle.bookings,
      invoices: bundle.invoices,
      support: bundle.support,
      leadOrigin: bundle.leadOrigin ?? null,
      appointments: {
        upcoming: bundle.bookings.upcoming.map((booking) => ({
          id: booking.id,
          scheduledAt: booking.scheduledAt,
          status: booking.status,
          serviceId: booking.service,
        })),
      },
      timeline: this.timelineBuilder.build({
        conversations: bundle.previousConversations,
        currentConversation: bundle.currentConversation,
        bookings: allBookings,
        invoices: allInvoices,
        opportunities: bundle.opportunities,
        supportTickets: [
          ...bundle.support.openTickets,
          ...bundle.support.closedTickets,
        ],
        leadOrigin: bundle.leadOrigin ?? null,
      }),
    };

    await this.cache.set(cacheKey, dto);
    return dto;
  }
}
