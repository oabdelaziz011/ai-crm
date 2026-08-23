export type TicketPriority = "low" | "normal" | "high" | "urgent";

export type TicketStatus =
  | "open"
  | "in_progress"
  | "waiting_customer"
  | "resolved"
  | "closed";

export type TicketSummary = {
  id: string;
  ticketNumber: string;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  customerId: string | null;
  conversationId: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
};

export type TicketAgentToolPorts = {
  /**
   * Internal ownership lookup — not an LLM-exposed tool.
   * Company-scoped; returns null when the ticket is missing for that company.
   */
  getTicket(input: {
    companyId: string;
    userId: string;
    ticketId: string;
  }): Promise<{ ticket: TicketSummary } | null>;

  createTicket(input: {
    companyId: string;
    userId: string;
    subject: string;
    description?: string;
    priority?: TicketPriority;
    customerId?: string;
    conversationId?: string;
  }): Promise<{ ticket: TicketSummary }>;

  updateTicket(input: {
    companyId: string;
    userId: string;
    ticketId: string;
    subject?: string;
    description?: string;
  }): Promise<{ ticket: TicketSummary }>;

  closeTicket(input: {
    companyId: string;
    userId: string;
    ticketId: string;
    resolutionNote?: string;
    status?: "resolved" | "closed";
  }): Promise<{ ticket: TicketSummary }>;

  assignTicket(input: {
    companyId: string;
    userId: string;
    ticketId: string;
    assigneeUserId?: string;
    assigneeName?: string;
  }): Promise<{ ticket: TicketSummary }>;

  addTicketComment(input: {
    companyId: string;
    userId: string;
    ticketId: string;
    body: string;
    isInternal?: boolean;
  }): Promise<{ commentId: string; ticketId: string }>;

  changeTicketPriority(input: {
    companyId: string;
    userId: string;
    ticketId: string;
    priority: TicketPriority;
  }): Promise<{ ticket: TicketSummary }>;

  changeTicketStatus(input: {
    companyId: string;
    userId: string;
    ticketId: string;
    status: TicketStatus;
  }): Promise<{ ticket: TicketSummary }>;

  searchTickets(input: {
    companyId: string;
    userId: string;
    query?: string;
    status?: TicketStatus;
    priority?: TicketPriority;
    assigneeName?: string;
    customerId?: string;
    limit?: number;
  }): Promise<{ tickets: TicketSummary[]; total: number }>;
};
