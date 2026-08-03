import type {
  Customer360BookingDto,
  Customer360ConversationSummaryDto,
  Customer360CurrentConversationDto,
  Customer360InvoiceDto,
  Customer360OpportunityDto,
  Customer360SupportTicketDto,
  Customer360TimelineEntryDto,
} from "../dto/customer-360-dto.js";

export type Customer360TimelineSource = {
  conversations?: Customer360ConversationSummaryDto[];
  currentConversation?: Customer360CurrentConversationDto;
  bookings?: Customer360BookingDto[];
  invoices?: Customer360InvoiceDto[];
  opportunities?: Customer360OpportunityDto[];
  supportTickets?: Customer360SupportTicketDto[];
  leadOrigin?: import("../dto/customer-360-dto.js").Customer360LeadOriginDto | null;
};

export class Customer360TimelineBuilder {
  build(source: Customer360TimelineSource): Customer360TimelineEntryDto[] {
    const entries: Customer360TimelineEntryDto[] = [];

    for (const conversation of source.conversations ?? []) {
      if (!conversation.lastMessageAt) continue;
      entries.push({
        id: `conversation:${conversation.id}`,
        occurredAt: conversation.lastMessageAt,
        category: "conversation",
        title: `${conversation.channelType} conversation`,
        summary: conversation.lastMessagePreview ?? conversation.status,
        metadata: { conversationId: conversation.id, channelType: conversation.channelType },
      });
    }

    for (const message of source.currentConversation?.latestMessages ?? []) {
      entries.push({
        id: `message:${message.createdAt}:${message.role}`,
        occurredAt: message.createdAt,
        category: "conversation",
        title: `Current ${message.role} message`,
        summary: message.content.slice(0, 240),
        metadata: { conversationId: source.currentConversation?.id },
      });
    }

    for (const booking of source.bookings ?? []) {
      if (!booking.scheduledAt) continue;
      entries.push({
        id: `booking:${booking.id}`,
        occurredAt: booking.scheduledAt,
        category: "booking",
        title: booking.service ?? "Booking",
        summary: `${booking.status} (${booking.source})`,
        metadata: { bookingId: booking.id, status: booking.status },
      });
    }

    for (const invoice of source.invoices ?? []) {
      entries.push({
        id: `invoice:${invoice.id}`,
        occurredAt: invoice.dueDate ?? new Date(0).toISOString(),
        category: "invoice",
        title: `Invoice ${invoice.status}`,
        summary: `${invoice.amount} ${invoice.currency} (${invoice.category})`,
        metadata: { invoiceId: invoice.id, status: invoice.status },
      });
    }

    for (const opportunity of source.opportunities ?? []) {
      entries.push({
        id: `opportunity:${opportunity.id}`,
        occurredAt: new Date().toISOString(),
        category: "sales",
        title: opportunity.title,
        summary: [opportunity.pipelineStage, opportunity.estimatedValue != null ? `$${opportunity.estimatedValue}` : null]
          .filter(Boolean)
          .join(" · "),
        metadata: { opportunityId: opportunity.id },
      });
    }

    for (const ticket of source.supportTickets ?? []) {
      entries.push({
        id: `support:${ticket.id}`,
        occurredAt: ticket.updatedAt ?? ticket.createdAt ?? ticket.slaDueAt ?? new Date().toISOString(),
        category: "support",
        title: ticket.ticketNumber ? `${ticket.ticketNumber} · ${ticket.subject}` : ticket.subject,
        summary: `${ticket.status}${ticket.priority ? ` · ${ticket.priority}` : ""}`,
        metadata: { ticketId: ticket.id, ticketNumber: ticket.ticketNumber },
      });
    }

    if (source.leadOrigin) {
      for (const activity of source.leadOrigin.activities) {
        entries.push({
          id: `lead-activity:${activity.id}`,
          occurredAt: activity.createdAt,
          category: "activity",
          title: `Lead ${activity.activityType}`,
          summary: activity.summary,
          metadata: { leadId: source.leadOrigin.leadId, activityType: activity.activityType },
        });
      }
      if (source.leadOrigin.convertedAt) {
        entries.push({
          id: `lead-converted:${source.leadOrigin.leadId}`,
          occurredAt: source.leadOrigin.convertedAt,
          category: "sales",
          title: "Lead converted to customer",
          summary: source.leadOrigin.title,
          metadata: { leadId: source.leadOrigin.leadId },
        });
      }
    }

    return entries.sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  }
}
