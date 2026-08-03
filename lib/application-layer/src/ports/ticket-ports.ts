export type TicketPriority = "low" | "normal" | "high" | "urgent";

export type TicketStatus =
  | "open"
  | "in_progress"
  | "waiting_customer"
  | "resolved"
  | "closed";

export type TicketReadModel = Readonly<{
  id: string;
  tenantId: string;
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
}>;

export type TicketCreateInput = Readonly<{
  tenantId: string;
  subject: string;
  description?: string;
  priority?: TicketPriority;
  customerId?: string;
  conversationId?: string;
  actorUserId: string;
}>;

export type TicketUpdateInput = Readonly<{
  subject?: string;
  description?: string;
  actorUserId: string;
}>;

export type TicketSearchFilter = Readonly<{
  query?: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  assigneeName?: string;
  customerId?: string;
  limit?: number;
}>;

export type TicketReadPort = {
  getById(tenantId: string, ticketId: string): Promise<TicketReadModel | null>;
  search(tenantId: string, filter: TicketSearchFilter): Promise<{ tickets: TicketReadModel[]; total: number }>;
};

export type TicketWritePort = {
  create(input: TicketCreateInput): Promise<TicketReadModel>;
  update(tenantId: string, ticketId: string, patch: TicketUpdateInput): Promise<TicketReadModel>;
  close(
    tenantId: string,
    ticketId: string,
    input: { resolutionNote?: string; status?: "resolved" | "closed"; actorUserId: string },
  ): Promise<TicketReadModel>;
  assign(
    tenantId: string,
    ticketId: string,
    input: { assigneeUserId?: string; assigneeName?: string; actorUserId: string },
  ): Promise<TicketReadModel>;
  addComment(
    tenantId: string,
    ticketId: string,
    input: { body: string; isInternal?: boolean; actorUserId: string },
  ): Promise<{ commentId: string; ticketId: string }>;
  changePriority(
    tenantId: string,
    ticketId: string,
    input: { priority: TicketPriority; actorUserId: string },
  ): Promise<TicketReadModel>;
  changeStatus(
    tenantId: string,
    ticketId: string,
    input: { status: TicketStatus; actorUserId: string },
  ): Promise<TicketReadModel>;
};
