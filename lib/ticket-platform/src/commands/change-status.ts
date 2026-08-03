import type { TicketCommandService } from "../services/ticket-command-service.js";
import type { TicketServiceContext, TicketStatus, TicketSummary } from "../types/ticket-types.js";

export type ChangeStatusInput = {
  companyId: string;
  ticketId: string;
  status: TicketStatus;
};

export function executeChangeStatus(
  service: TicketCommandService,
  ctx: TicketServiceContext,
  input: ChangeStatusInput,
): Promise<{ ticket: TicketSummary }> {
  return service.changeStatus(ctx, input);
}
