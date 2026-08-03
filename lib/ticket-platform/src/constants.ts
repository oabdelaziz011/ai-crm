export const TICKET_PERMISSIONS = {
  view: "tickets.view",
  create: "tickets.create",
  edit: "tickets.edit",
  assign: "tickets.assign",
  comment: "tickets.comment",
  close: "tickets.close",
  manage: "tickets.manage",
} as const;

export const TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;

export const TICKET_STATUSES = [
  "open",
  "in_progress",
  "waiting_customer",
  "resolved",
  "closed",
] as const;

export const OPEN_TICKET_STATUSES = ["open", "in_progress", "waiting_customer"] as const;

export const TERMINAL_TICKET_STATUSES = ["resolved", "closed"] as const;

/** Default SLA resolution window in hours by priority. */
export const SLA_HOURS_BY_PRIORITY: Record<(typeof TICKET_PRIORITIES)[number], number> = {
  urgent: 4,
  high: 8,
  normal: 24,
  low: 72,
};

export const TICKET_DOMAIN_EVENTS = [
  "ticket_created",
  "ticket_updated",
  "ticket_closed",
  "ticket_reopened",
  "ticket_assigned",
  "ticket_comment_added",
  "ticket_priority_changed",
  "ticket_deleted",
  "ticket_status_changed",
] as const;

export const TICKET_WORKFLOW_EVENTS: Record<(typeof TICKET_DOMAIN_EVENTS)[number], string> = {
  ticket_created: "ticket.created",
  ticket_updated: "ticket.updated",
  ticket_closed: "ticket.closed",
  ticket_reopened: "ticket.reopened",
  ticket_assigned: "ticket.assigned",
  ticket_comment_added: "ticket.comment_added",
  ticket_priority_changed: "ticket.priority_changed",
  ticket_deleted: "ticket.deleted",
  ticket_status_changed: "ticket.status_changed",
};

/** Default query cache TTLs (ms). Swap cache backend without changing services. */
export const TICKET_QUERY_CACHE_TTL = {
  metrics: 5 * 60 * 1000,
  customerSnapshot: 60 * 1000,
  openCount: 60 * 1000,
  list: 30 * 1000,
} as const;
