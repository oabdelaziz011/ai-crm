export type ApplicationErrorCode =
  | "VALIDATION_ERROR"
  | "PERMISSION_DENIED"
  | "BUSINESS_RULE_VIOLATION"
  | "CONCURRENCY_CONFLICT"
  | "RESOURCE_NOT_FOUND"
  | "INFRASTRUCTURE_FAILURE";

export class ApplicationError extends Error {
  readonly code: ApplicationErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: ApplicationErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ApplicationError";
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends ApplicationError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("VALIDATION_ERROR", message, details);
    this.name = "ValidationError";
  }
}

export class PermissionDeniedError extends ApplicationError {
  constructor(message = "Permission denied", details?: Record<string, unknown>) {
    super("PERMISSION_DENIED", message, details);
    this.name = "PermissionDeniedError";
  }
}

export class BusinessRuleViolationError extends ApplicationError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("BUSINESS_RULE_VIOLATION", message, details);
    this.name = "BusinessRuleViolationError";
  }
}

export class ConcurrencyConflictError extends ApplicationError {
  constructor(message = "Concurrency conflict", details?: Record<string, unknown>) {
    super("CONCURRENCY_CONFLICT", message, details);
    this.name = "ConcurrencyConflictError";
  }
}

export class ResourceNotFoundError extends ApplicationError {
  constructor(resource: string, id?: string) {
    super("RESOURCE_NOT_FOUND", id ? `${resource} not found: ${id}` : `${resource} not found`, {
      resource,
      id,
    });
    this.name = "ResourceNotFoundError";
  }
}

export class InfrastructureFailureError extends ApplicationError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("INFRASTRUCTURE_FAILURE", message, details);
    this.name = "InfrastructureFailureError";
  }
}

export function isApplicationError(error: unknown): error is ApplicationError {
  return error instanceof ApplicationError;
}
