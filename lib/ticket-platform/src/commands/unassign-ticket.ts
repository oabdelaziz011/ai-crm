import type { TicketCommandService } from "../services/ticket-command-service.js";
import type { TicketServiceContext, TicketSummary } from "../types/ticket-types.js";

export type UnassignTicketInput = {
  companyId: string;
  ticketId: string;
};

export function executeUnassignTicket(
  service: TicketCommandService,
  ctx: TicketServiceContext,
  input: UnassignTicketInput,
): Promise<{ ticket: TicketSummary }> {
  return service.unassignTicket(ctx, input);
}
