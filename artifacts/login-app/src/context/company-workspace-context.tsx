import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useCompanyWorkspaceBundle } from "@/hooks/company-workspace/use-company-workspace-bundle";
import {
  canManageCompanyBranches,
  canManageCompanyBranding,
  canManageCompanyDepartments,
  canManageCompanyEmployees,
  canUpdateCompany,
  canViewCompanySubscription,
  canViewCompanyWorkspace,
} from "@/lib/company-workspace/permissions";
import type { CompanyWorkspaceBundle } from "@/lib/company-workspace/types";
import { useAuthUser } from "@/hooks/use-rbac";

export type CompanyWorkspacePermissions = {
  canView: boolean;
  canUpdate: boolean;
  canBranding: boolean;
  canSubscription: boolean;
  canManageEmployees: boolean;
  canManageBranches: boolean;
  canManageDepartments: boolean;
};

export type CompanyWorkspaceContextValue = {
  bundle: CompanyWorkspaceBundle | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  permissions: CompanyWorkspacePermissions;
};

const CompanyWorkspaceContext = createContext<CompanyWorkspaceContextValue | null>(null);

export function CompanyWorkspaceProvider({ children }: { children: ReactNode }) {
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const canView = canViewCompanyWorkspace({ hasPermission, isSuperAdmin });
  const query = useCompanyWorkspaceBundle(canView);

  const permissions = useMemo<CompanyWorkspacePermissions>(
    () => ({
      canView,
      canUpdate: canUpdateCompany({ hasPermission, isSuperAdmin }),
      canBranding: canManageCompanyBranding({ hasPermission, isSuperAdmin }),
      canSubscription: canViewCompanySubscription({ hasPermission, isSuperAdmin }),
      canManageEmployees: canManageCompanyEmployees({ hasPermission, isSuperAdmin }),
      canManageBranches: canManageCompanyBranches({ hasPermission, isSuperAdmin }),
      canManageDepartments: canManageCompanyDepartments({ hasPermission, isSuperAdmin }),
    }),
    [canView, hasPermission, isSuperAdmin],
  );

  const value = useMemo<CompanyWorkspaceContextValue>(
    () => ({
      bundle: query.data ?? null,
      isLoading: query.isLoading,
      isError: query.isError,
      error: query.error instanceof Error ? query.error : null,
      refetch: () => {
        void query.refetch();
      },
      permissions,
    }),
    [
      permissions,
      query.data,
      query.error,
      query.isError,
      query.isLoading,
      query.refetch,
    ],
  );

  return (
    <CompanyWorkspaceContext.Provider value={value}>{children}</CompanyWorkspaceContext.Provider>
  );
}

export function useCompanyWorkspace(): CompanyWorkspaceContextValue {
  const ctx = useContext(CompanyWorkspaceContext);
  if (!ctx) throw new Error("useCompanyWorkspace must be used within CompanyWorkspaceProvider");
  return ctx;
}
