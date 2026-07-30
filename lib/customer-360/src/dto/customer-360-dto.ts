export type Customer360ProfileDto = {
  id: string;
  name: string;
  emails: string[];
  phones: string[];
  companyName?: string | null;
  tags: string[];
  segment?: string | null;
  language?: string | null;
  timezone?: string | null;
  assignedEmployeeId?: string | null;
  assignedEmployeeName?: string | null;
  notes?: string | null;
};

export type Customer360ConversationSummaryDto = {
  id: string;
  channelType: string;
  status: string;
  lastMessagePreview?: string | null;
  lastMessageAt?: string | null;
  sentiment?: string | null;
};

export type Customer360CurrentConversationDto = {
  id: string;
  channelType: string;
  status: string;
  latestMessages: Array<{ role: string; content: string; createdAt: string }>;
  sentiment?: string | null;
};

export type Customer360OpportunityDto = {
  id: string;
  title: string;
  pipelineStage?: string | null;
  estimatedValue?: number | null;
  ownerName?: string | null;
  status?: string | null;
};

export type Customer360BookingDto = {
  id: string;
  service?: string | null;
  status: string;
  scheduledAt?: string | null;
  source: "scheduling" | "legacy";
};

export type Customer360InvoiceDto = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  dueDate?: string | null;
  category: "unpaid" | "overdue" | "paid";
};

export type Customer360SupportTicketDto = {
  id: string;
  subject: string;
  priority?: string | null;
  status: string;
  slaDueAt?: string | null;
};

export type Customer360TimelineEntryDto = {
  id: string;
  occurredAt: string;
  category: "conversation" | "booking" | "invoice" | "sales" | "support" | "activity";
  title: string;
  summary: string;
  metadata?: Record<string, unknown>;
};

export type Customer360Dto = {
  version: "1";
  customerId: string;
  companyId: string;
  generatedAt: string;
  customer: Customer360ProfileDto;
  conversation: {
    current?: Customer360CurrentConversationDto;
    previous: Customer360ConversationSummaryDto[];
  };
  sales: {
    opportunities: Customer360OpportunityDto[];
  };
  bookings: {
    upcoming: Customer360BookingDto[];
    completed: Customer360BookingDto[];
    cancelled: Customer360BookingDto[];
  };
  invoices: {
    unpaid: Customer360InvoiceDto[];
    overdue: Customer360InvoiceDto[];
    paid: Customer360InvoiceDto[];
  };
  support: {
    openTickets: Customer360SupportTicketDto[];
  };
  timeline: Customer360TimelineEntryDto[];
};
