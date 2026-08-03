import type { TicketCommandService } from "../services/ticket-command-service.js";
import type { TicketServiceContext, TicketSummary } from "../types/ticket-types.js";

export type ReopenTicketInput = {
  companyId: string;
  ticketId: string;
  reason?: string;
};

export function executeReopenTicket(
  service: TicketCommandService,
  ctx: TicketServiceContext,
  input: ReopenTicketInput,
): Promise<{ ticket: TicketSummary }> {
  return service.reopenTicket(ctx, input);
}
