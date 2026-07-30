import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth-context";
import { useAuthUser } from "@/hooks/use-rbac";
import { useKnowledgeFeatureEnabled } from "@/hooks/platform-ai/use-platform-ai-feature-enabled";
import { canViewKnowledge } from "@/lib/knowledge/knowledge-permissions";
import { isKnowledgeRouteAccessible } from "@/lib/platform-ai/knowledge-access";
import type { KnowledgeRouteDefinition } from "@/config/knowledge-route-registry";

type Props = {
  route: KnowledgeRouteDefinition;
  Page: KnowledgeRouteDefinition["Page"];
};

export function KnowledgeRouteGuard({ route, Page }: Props) {
  const { t } = useTranslation("common");
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const { company } = useAuth();
  const { resolvedEnabled: knowledgeFeatureEnabled } = useKnowledgeFeatureEnabled();

  if (
    !isKnowledgeRouteAccessible({
      isSuperAdmin,
      hasPermission,
      knowledgeFeatureEnabled,
    })
  ) {
    if (!canViewKnowledge(hasPermission, isSuperAdmin)) {
      return <p className="text-sm text-muted-foreground">{t("knowledge.noPermission")}</p>;
    }
    return <p className="text-sm text-muted-foreground">{t("knowledge.featureDisabled")}</p>;
  }

  if (!company?.id) {
    return <p className="text-sm text-muted-foreground">{t("knowledge.companyRequired")}</p>;
  }

  if (route.permission && !isSuperAdmin && !hasPermission(route.permission)) {
    return <p className="text-sm text-muted-foreground">{t("knowledge.sectionNoPermission")}</p>;
  }

  return <Page />;
}
