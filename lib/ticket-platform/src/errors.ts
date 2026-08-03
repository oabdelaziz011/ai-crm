export class TicketDomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "TicketDomainError";
    this.code = code;
  }
}

export class TicketNotFoundError extends TicketDomainError {
  constructor(ticketId: string) {
    super("TICKET_NOT_FOUND", `Ticket ${ticketId} was not found.`);
    this.name = "TicketNotFoundError";
  }
}

export class TicketPermissionDeniedError extends TicketDomainError {
  constructor(permission: string) {
    super("TICKET_PERMISSION_DENIED", `Permission denied: ${permission}`);
    this.name = "TicketPermissionDeniedError";
  }
}

export class TicketValidationError extends TicketDomainError {
  constructor(message: string) {
    super("TICKET_VALIDATION_ERROR", message);
    this.name = "TicketValidationError";
  }
}

export class TicketStatusTransitionError extends TicketDomainError {
  constructor(from: string, to: string) {
    super("TICKET_STATUS_TRANSITION_INVALID", `Cannot transition ticket from "${from}" to "${to}".`);
    this.name = "TicketStatusTransitionError";
  }
}

export class TicketAssigneeNotFoundError extends TicketDomainError {
  constructor(name: string) {
    super("TICKET_ASSIGNEE_NOT_FOUND", `No agent found matching "${name}".`);
    this.name = "TicketAssigneeNotFoundError";
  }
}

export class TicketAssigneeAmbiguousError extends TicketDomainError {
  constructor(name: string) {
    super("TICKET_ASSIGNEE_AMBIGUOUS", `Multiple agents match "${name}". Provide assigneeUserId.`);
    this.name = "TicketAssigneeAmbiguousError";
  }
}
