import { useAuth } from "@/context/auth-context";
import { usePermissions } from "@/hooks/use-rbac";
import { canViewPrompts } from "@/lib/prompts/prompt-permissions";
import type { PromptRouteDefinition } from "@/config/prompt-route-registry";

type Props = {
  route: PromptRouteDefinition;
  Page: PromptRouteDefinition["Page"];
};

export function PromptRouteGuard({ route, Page }: Props) {
  const { hasPermission, isSuperAdmin } = usePermissions();
  const { company } = useAuth();

  if (!canViewPrompts(hasPermission, isSuperAdmin)) {
    return <p className="text-sm text-muted-foreground">You do not have permission to view prompts.</p>;
  }

  if (!company?.id && route.id !== "library") {
    return <p className="text-sm text-muted-foreground">A company context is required to manage prompts.</p>;
  }

  if (route.permission && !isSuperAdmin && !hasPermission(route.permission)) {
    return <p className="text-sm text-muted-foreground">You do not have permission to view this prompt section.</p>;
  }

  return <Page />;
}
