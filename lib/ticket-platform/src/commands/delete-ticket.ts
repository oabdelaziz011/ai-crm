import type { TicketCommandService } from "../services/ticket-command-service.js";
import type { TicketServiceContext } from "../types/ticket-types.js";

export type DeleteTicketInput = {
  companyId: string;
  ticketId: string;
};

export function executeDeleteTicket(
  service: TicketCommandService,
  ctx: TicketServiceContext,
  input: DeleteTicketInput,
): Promise<{ ticketId: string }> {
  return service.deleteTicket(ctx, input);
}
