import type { TicketCommandService } from "../services/ticket-command-service.js";
import type { TicketServiceContext, TicketSummary } from "../types/ticket-types.js";

export type UpdateTicketInput = {
  companyId: string;
  ticketId: string;
  subject?: string;
  description?: string;
};

export function executeUpdateTicket(
  service: TicketCommandService,
  ctx: TicketServiceContext,
  input: UpdateTicketInput,
): Promise<{ ticket: TicketSummary }> {
  return service.updateTicket(ctx, input);
}
