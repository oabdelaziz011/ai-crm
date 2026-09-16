export class AssignmentAuditError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AssignmentAuditError";
    this.code = code;
  }
}

export class AssignmentAuditCompanyScopeError extends AssignmentAuditError {
  constructor(message = "Cross-company assignment audit is not allowed.") {
    super("COMPANY_SCOPE", message);
    this.name = "AssignmentAuditCompanyScopeError";
  }
}

export class AssignmentAuditValidationError extends AssignmentAuditError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = "AssignmentAuditValidationError";
  }
}
