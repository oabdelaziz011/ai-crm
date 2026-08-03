import { TICKET_PRIORITIES, TICKET_STATUSES } from "../constants.js";
import { TicketValidationError } from "../errors.js";
import type { TicketPriority, TicketStatus } from "../types/ticket-types.js";

export function readRequiredString(value: unknown, label: string): string {
  const normalized = typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
  if (!normalized) throw new TicketValidationError(`${label} is required.`);
  return normalized;
}

export function readOptionalString(value: unknown): string | undefined {
  if (value == null) return undefined;
  const normalized = typeof value === "string" ? value.trim() : String(value).trim();
  return normalized || undefined;
}

export function readPriority(value: unknown, fallback: TicketPriority = "normal"): TicketPriority {
  const normalized = readOptionalString(value)?.toLowerCase();
  if (!normalized) return fallback;
  if (!TICKET_PRIORITIES.includes(normalized as TicketPriority)) {
    throw new TicketValidationError(`Priority must be one of: ${TICKET_PRIORITIES.join(", ")}.`);
  }
  return normalized as TicketPriority;
}

export function readStatus(value: unknown): TicketStatus {
  const normalized = readRequiredString(value, "Status").toLowerCase();
  if (!TICKET_STATUSES.includes(normalized as TicketStatus)) {
    throw new TicketValidationError(`Status must be one of: ${TICKET_STATUSES.join(", ")}.`);
  }
  return normalized as TicketStatus;
}

export function readLimit(value: unknown, fallback = 20, max = 100): number {
  if (value == null) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(Math.floor(parsed), max);
}

export function readOffset(value: unknown): number {
  if (value == null) return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}
