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
  ticketNumber?: string | null;
  subject: string;
  priority?: string | null;
  status: string;
  slaDueAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type Customer360TimelineEntryDto = {
  id: string;
  occurredAt: string;
  category: "conversation" | "booking" | "invoice" | "sales" | "support" | "activity";
  title: string;
  summary: string;
  metadata?: Record<string, unknown>;
};

export type Customer360LeadOriginDto = {
  leadId: string;
  title: string;
  sourceId?: string | null;
  score: number;
  lifecycleStatus: string;
  convertedAt?: string | null;
  pipelineId?: string | null;
  stageId?: string | null;
  assignedUserId?: string | null;
  aiSummary?: string | null;
  tags: string[];
  activities: Array<{ id: string; activityType: string; summary: string; createdAt: string }>;
  history: Array<{ id: string; fieldName: string; previousValue: string | null; newValue: string | null; createdAt: string }>;
  notes: Array<{ id: string; body: string; createdAt: string }>;
};

export type Customer360AppointmentPlaceholderDto = {
  id: string;
  status: "future_ready";
  label: string;
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
    closedTickets: Customer360SupportTicketDto[];
    lastTicket: Customer360SupportTicketDto | null;
    ticketCount: number;
  };
  leadOrigin?: Customer360LeadOriginDto | null;
  appointments: {
    upcoming: Customer360AppointmentPlaceholderDto[];
  };
  timeline: Customer360TimelineEntryDto[];
};
