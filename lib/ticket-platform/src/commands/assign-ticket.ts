import type { TicketCommandService } from "../services/ticket-command-service.js";
import type { TicketServiceContext, TicketSummary } from "../types/ticket-types.js";

export type AssignTicketInput = {
  companyId: string;
  ticketId: string;
  assigneeUserId?: string;
  assigneeName?: string;
};

export function executeAssignTicket(
  service: TicketCommandService,
  ctx: TicketServiceContext,
  input: AssignTicketInput,
): Promise<{ ticket: TicketSummary }> {
  return service.assignTicket(ctx, input);
}
