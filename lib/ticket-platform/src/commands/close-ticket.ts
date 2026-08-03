import type { TicketCommandService } from "../services/ticket-command-service.js";
import type { TicketServiceContext, TicketSummary } from "../types/ticket-types.js";

export type CloseTicketInput = {
  companyId: string;
  ticketId: string;
  resolutionNote?: string;
  status?: "resolved" | "closed";
};

export function executeCloseTicket(
  service: TicketCommandService,
  ctx: TicketServiceContext,
  input: CloseTicketInput,
): Promise<{ ticket: TicketSummary }> {
  return service.closeTicket(ctx, input);
}
