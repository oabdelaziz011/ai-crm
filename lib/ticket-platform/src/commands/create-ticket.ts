import type { TicketCommandService } from "../services/ticket-command-service.js";
import type { TicketServiceContext, TicketSummary } from "../types/ticket-types.js";
import type { TicketPriority } from "../types/ticket-types.js";

export type CreateTicketInput = {
  companyId: string;
  subject: string;
  description?: string;
  priority?: TicketPriority;
  customerId?: string;
  conversationId?: string;
};

export function executeCreateTicket(
  service: TicketCommandService,
  ctx: TicketServiceContext,
  input: CreateTicketInput,
): Promise<{ ticket: TicketSummary }> {
  return service.createTicket(ctx, input);
}
