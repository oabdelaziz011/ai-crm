import { createContext, useContext, type ReactNode } from "react";
import { useHasPermission } from "@/hooks/use-rbac";

interface PermissionGuardProps {
  permission: string;
  children: ReactNode;
  fallback?: ReactNode;
}

export function PermissionGuard({ permission, children, fallback = null }: PermissionGuardProps) {
  const allowed = useHasPermission(permission);
  console.log("[PermissionGuard]", permission, "allowed:", allowed);
  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}

interface CanProps extends Omit<PermissionGuardProps, "permission"> {
  permission: string;
}

export function Can({ permission, children, fallback }: CanProps) {
  return (
    <PermissionGuard permission={permission} fallback={fallback}>
      {children}
    </PermissionGuard>
  );
}
