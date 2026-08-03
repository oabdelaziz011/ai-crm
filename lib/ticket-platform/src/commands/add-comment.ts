import type { TicketCommandService } from "../services/ticket-command-service.js";
import type { TicketServiceContext } from "../types/ticket-types.js";

export type AddCommentInput = {
  companyId: string;
  ticketId: string;
  body: string;
  isInternal?: boolean;
};

export function executeAddComment(
  service: TicketCommandService,
  ctx: TicketServiceContext,
  input: AddCommentInput,
): Promise<{ commentId: string; ticketId: string }> {
  return service.addComment(ctx, input);
}
