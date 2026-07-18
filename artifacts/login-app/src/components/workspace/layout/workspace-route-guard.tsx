import { useAuth } from "@/context/auth-context";
import { useAuthUser } from "@/hooks/use-rbac";
import { canAccessWorkspace } from "@/lib/workspace/workspace-permissions";
import type { WorkspaceRouteDefinition } from "@/config/workspace-route-registry";

type Props = {
  route: WorkspaceRouteDefinition;
  Page: WorkspaceRouteDefinition["Page"];
};

export function WorkspaceRouteGuard({ route, Page }: Props) {
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const { company } = useAuth();
  const hasCompany = Boolean(company?.id);

  if (!canAccessWorkspace(hasPermission, isSuperAdmin, hasCompany)) {
    return <p className="text-sm text-muted-foreground">You do not have permission to access the workspace.</p>;
  }

  if (route.permission && !isSuperAdmin && !hasPermission(route.permission) && !hasPermission("workspace.view")) {
    return <p className="text-sm text-muted-foreground">You do not have permission to view this workspace section.</p>;
  }

  return <Page />;
}
