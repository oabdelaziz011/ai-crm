export class OpportunityValidationError extends Error {
  readonly code = "OPPORTUNITY_VALIDATION";
  constructor(message: string) {
    super(message);
    this.name = "OpportunityValidationError";
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
