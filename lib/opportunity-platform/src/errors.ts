export class OpportunityValidationError extends Error {
  readonly code = "OPPORTUNITY_VALIDATION";
  /** Machine-stable reason for structured API / UI handling. */
  readonly reason: string | null;
  constructor(message: string, reason: string | null = null) {
    super(message);
    this.name = "OpportunityValidationError";
    this.reason = reason;
  }
}

export class OpportunityNotFoundError extends Error {
  readonly code = "OPPORTUNITY_NOT_FOUND";
  constructor(id: string) {
    super(`Opportunity not found: ${id}`);
    this.name = "OpportunityNotFoundError";
  }
}

export class OpportunityPermissionError extends Error {
  readonly code = "OPPORTUNITY_PERMISSION";
  constructor(permission: string) {
    super(`Missing permission: ${permission}`);
    this.name = "OpportunityPermissionError";
  }
}
