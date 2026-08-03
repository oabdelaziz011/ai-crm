import type { TicketCommandService } from "../services/ticket-command-service.js";
import type { TicketServiceContext } from "../types/ticket-types.js";

export type AddInternalNoteInput = {
  companyId: string;
  ticketId: string;
  body: string;
};

export function executeAddInternalNote(
  service: TicketCommandService,
  ctx: TicketServiceContext,
  input: AddInternalNoteInput,
): Promise<{ commentId: string; ticketId: string }> {
  return service.addInternalNote(ctx, input);
}
