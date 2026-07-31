export class DashboardError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DashboardError";
    this.code = code;
  }
}

export class DashboardAccessRequiredError extends DashboardError {
  constructor() {
    super("DASHBOARD_ACCESS_REQUIRED", "Dashboard access context is required.");
  }
}

export class DashboardAuthenticationError extends DashboardError {
  constructor() {
    super("DASHBOARD_AUTHENTICATION_REQUIRED", "Authenticated user is required for dashboard access.");
  }
}

export class DashboardPermissionDeniedError extends DashboardError {
  readonly permission: string;

  constructor(permission: string) {
    super("DASHBOARD_PERMISSION_DENIED", `Permission denied: ${permission} required for dashboard access.`);
    this.permission = permission;
  }
}

export class DashboardTenantIsolationError extends DashboardError {
  constructor() {
    super("DASHBOARD_TENANT_ISOLATION", "Tenant isolation violation: company access denied.");
  }
}

export class DashboardProviderError extends DashboardError {
  readonly providerId: string;

  constructor(providerId: string, message: string) {
    super("DASHBOARD_PROVIDER_ERROR", message);
    this.providerId = providerId;
  }
}

export const DashboardErrors = {
  DashboardError,
  DashboardAccessRequiredError,
  DashboardAuthenticationError,
  DashboardPermissionDeniedError,
  DashboardTenantIsolationError,
  DashboardProviderError,
} as const;
