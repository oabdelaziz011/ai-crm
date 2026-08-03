import type { TicketCommandService } from "../services/ticket-command-service.js";
import type { TicketPriority, TicketServiceContext, TicketSummary } from "../types/ticket-types.js";

export type ChangePriorityInput = {
  companyId: string;
  ticketId: string;
  priority: TicketPriority;
};

export function executeChangePriority(
  service: TicketCommandService,
  ctx: TicketServiceContext,
  input: ChangePriorityInput,
): Promise<{ ticket: TicketSummary }> {
  return service.changePriority(ctx, input);
}
