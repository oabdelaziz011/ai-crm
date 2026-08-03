export class LeadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeadError";
  }
}

export class LeadNotFoundError extends LeadError {
  constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`);
    this.name = "LeadNotFoundError";
  }
}

export class LeadPermissionDeniedError extends LeadError {
  constructor(permission: string) {
    super(`Permission denied: ${permission}`);
    this.name = "LeadPermissionDeniedError";
  }
}

export class LeadValidationError extends LeadError {
  constructor(message: string) {
    super(message);
    this.name = "LeadValidationError";
  }
}

export class LeadConflictError extends LeadError {
  constructor(message: string) {
    super(message);
    this.name = "LeadConflictError";
  }
}

export class LeadStageTransitionError extends LeadError {
  constructor(from: string, to: string) {
    super(`Invalid stage transition: ${from} → ${to}`);
    this.name = "LeadStageTransitionError";
  }
}
