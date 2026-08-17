import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth-context";
import { usePermissions } from "@/hooks/use-rbac";
import { canViewPrompts } from "@/lib/prompts/prompt-permissions";
import type { PromptRouteDefinition } from "@/config/prompt-route-registry";

type Props = {
  route: PromptRouteDefinition;
  Page: PromptRouteDefinition["Page"];
};

export function PromptRouteGuard({ route, Page }: Props) {
  const { t } = useTranslation("common");
  const { hasPermission, isSuperAdmin } = usePermissions();
  const { company } = useAuth();

  if (!canViewPrompts(hasPermission, isSuperAdmin)) {
    return <p className="text-sm text-muted-foreground">{t("prompts.noPermission")}</p>;
  }

  if (!company?.id && route.id !== "library") {
    return <p className="text-sm text-muted-foreground">{t("prompts.errors.companyRequired")}</p>;
  }

  if (route.permission && !isSuperAdmin && !hasPermission(route.permission)) {
    return <p className="text-sm text-muted-foreground">{t("prompts.errors.sectionPermission")}</p>;
  }

  return <Page />;
}
