import { TERMINAL_TICKET_STATUSES } from "../constants.js";
import { TicketStatusTransitionError } from "../errors.js";
import type { TicketStatus } from "../types/ticket-types.js";

const ALLOWED_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  open: ["in_progress", "waiting_customer", "resolved", "closed"],
  in_progress: ["open", "waiting_customer", "resolved", "closed"],
  waiting_customer: ["in_progress", "resolved", "closed", "open"],
  resolved: ["closed", "open"],
  closed: ["open"],
};

export function assertStatusTransition(from: TicketStatus, to: TicketStatus): void {
  if (from === to) return;
  const allowed = ALLOWED_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new TicketStatusTransitionError(from, to);
  }
}

export function isTerminalStatus(status: TicketStatus): boolean {
  return (TERMINAL_TICKET_STATUSES as readonly string[]).includes(status);
}

export function isReopenTransition(from: TicketStatus, to: TicketStatus): boolean {
  return isTerminalStatus(from) && to === "open";
}
