export type AutomationTicketSummary = {
  id: string;
  ticketNumber: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  customerId: string | null;
  conversationId: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateAutomationTicketInput = {
  companyId: string;
  actorUserId: string;
  subject: string;
  description?: string;
  priority?: string;
  customerId?: string;
  conversationId?: string;
};

export type AssignAutomationTicketInput = {
  companyId: string;
  actorUserId: string;
  ticketId: string;
  assigneeUserId?: string;
  assigneeName?: string;
};

export type FindAutomationTicketInput = {
  companyId: string;
  actorUserId: string;
  ticketNumber: string;
};

export type FindAutomationTicketResult =
  | { status: "found"; ticket: AutomationTicketSummary }
  | { status: "not_found"; ticket: null };

export interface TicketServicePort {
  createTicket(input: CreateAutomationTicketInput): Promise<{ ticket: AutomationTicketSummary }>;
  assignTicket(input: AssignAutomationTicketInput): Promise<{ ticket: AutomationTicketSummary }>;
  findTicket(input: FindAutomationTicketInput): Promise<FindAutomationTicketResult>;
}
