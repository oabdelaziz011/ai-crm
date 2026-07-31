import {
  DashboardAccessRequiredError,
  DashboardAuthenticationError,
  DashboardPermissionDeniedError,
  DashboardTenantIsolationError,
} from "./errors.js";
import type { DashboardAccess, DashboardMetricProvider, DashboardQuery } from "./types.js";

export const DASHBOARD_VIEW_PERMISSION = "dashboard.view";

export class DashboardPermissionService {
  assertAuthenticated(access: DashboardAccess | null | undefined): asserts access is DashboardAccess {
    if (!access?.userId) {
      throw new DashboardAccessRequiredError();
    }
    if (!access.companyId) {
      throw new DashboardAuthenticationError();
    }
  }

  assertTenantAccess(access: DashboardAccess, companyId: string): void {
    if (access.isSuperAdmin) return;
    if (access.companyId !== companyId) {
      throw new DashboardTenantIsolationError();
    }
  }

  assertDashboardReadAccess(access: DashboardAccess, query: DashboardQuery): void {
    this.assertAuthenticated(access);
    this.assertTenantAccess(access, query.companyId);

    if (access.isSuperAdmin) return;

    if (!access.hasPermission(DASHBOARD_VIEW_PERMISSION)) {
      throw new DashboardPermissionDeniedError(DASHBOARD_VIEW_PERMISSION);
    }
  }

  filterProvidersByPermission(
    access: DashboardAccess,
    providers: DashboardMetricProvider[],
  ): DashboardMetricProvider[] {
    if (access.isSuperAdmin) return providers;

    return providers.filter((provider) => {
      const required = provider.requiredPermissions ?? [];
      return required.every((permission) => access.hasPermission(permission));
    });
  }
}

export const dashboardPermissionService = new DashboardPermissionService();

export function assertDashboardAccess(
  access: DashboardAccess | null | undefined,
  query: DashboardQuery,
): DashboardAccess {
  dashboardPermissionService.assertDashboardReadAccess(access as DashboardAccess, query);
  return access as DashboardAccess;
}
