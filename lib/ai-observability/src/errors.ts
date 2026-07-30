export class AIObservabilityError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AIObservabilityError";
    this.code = code;
  }
}

export class TraceNotFoundError extends AIObservabilityError {
  constructor(id?: string) {
    super("TRACE_NOT_FOUND", id ? `Trace ${id} not found.` : "Trace not found.");
  }
}

export class TraceSpanNotFoundError extends AIObservabilityError {
  constructor(id?: string) {
    super("TRACE_SPAN_NOT_FOUND", id ? `Trace span ${id} not found.` : "Trace span not found.");
  }
}

export class PermissionDeniedError extends AIObservabilityError {
  constructor(permission: string) {
    super("PERMISSION_DENIED", `Missing required permission: ${permission}`);
  }
}

export class AnalyticsFeatureDisabledError extends AIObservabilityError {
  constructor() {
    super("ANALYTICS_FEATURE_DISABLED", "AI Analytics is disabled for this company.");
  }
}

export class ValidationError extends AIObservabilityError {
  constructor(message: string) {
    super("VALIDATION_ERROR", message);
  }
}
