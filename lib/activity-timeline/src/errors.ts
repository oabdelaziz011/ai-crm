export class TimelineError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "TimelineError";
    this.code = code;
  }
}

export class TimelinePermissionDeniedError extends TimelineError {
  readonly permission: string;

  constructor(permission: string) {
    super("TIMELINE_PERMISSION_DENIED", `Permission denied: ${permission} required for timeline access.`);
    this.permission = permission;
  }
}

export class TimelineTenantIsolationError extends TimelineError {
  constructor() {
    super("TIMELINE_TENANT_ISOLATION", "Tenant isolation violation: company access denied.");
  }
}

export class TimelineEntityAccessError extends TimelineError {
  constructor(message = "Entity access denied.", code = "TIMELINE_ENTITY_ACCESS_DENIED") {
    super(code, message);
  }
}

/** Customer id exists for the viewer but does not belong to the requested company. */
export class CustomerNotFoundInTenantError extends TimelineEntityAccessError {
  constructor(message = "Customer not found in tenant.") {
    super(message, "CUSTOMER_NOT_FOUND_IN_TENANT");
  }
}

/** Activity aggregation/query failed after access checks. */
export class ActivityQueryFailedError extends TimelineError {
  constructor(message = "Activity query failed.") {
    super("ACTIVITY_QUERY_FAILED", message);
  }
}

export class TimelinePublishError extends TimelineError {
  constructor(code: string, message: string) {
    super(code, message);
  }
}

export class TimelineCursorNotFoundError extends TimelineError {
  constructor() {
    super("TIMELINE_CURSOR_NOT_FOUND", "Timeline cursor is stale or invalid.");
  }
}

export class TimelineAccessRequiredError extends TimelineError {
  constructor() {
    super("TIMELINE_ACCESS_REQUIRED", "Timeline access context is required.");
  }
}
