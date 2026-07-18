import { useAuth } from "@/context/auth-context";
import { useAuthUser } from "@/hooks/use-rbac";
import { canViewKnowledge } from "@/lib/knowledge/knowledge-permissions";
import type { KnowledgeRouteDefinition } from "@/config/knowledge-route-registry";

type Props = {
  route: KnowledgeRouteDefinition;
  Page: KnowledgeRouteDefinition["Page"];
};

export function KnowledgeRouteGuard({ route, Page }: Props) {
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const { company } = useAuth();

  if (!canViewKnowledge(hasPermission, isSuperAdmin)) {
    return <p className="text-sm text-muted-foreground">You do not have permission to view knowledge.</p>;
  }

  if (!company?.id) {
    return <p className="text-sm text-muted-foreground">A company context is required to manage knowledge.</p>;
  }

  if (route.permission && !isSuperAdmin && !hasPermission(route.permission)) {
    return <p className="text-sm text-muted-foreground">You do not have permission to view this knowledge section.</p>;
  }

  return <Page />;
}
