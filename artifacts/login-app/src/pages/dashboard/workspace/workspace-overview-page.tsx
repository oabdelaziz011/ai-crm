import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { DashboardCard } from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { useCompanyIdentity } from "@/hooks/company-workspace/use-company-identity";
import { nestedSectionHref } from "@/lib/routing";
import { canAccessWorkspace } from "@/lib/workspace/workspace-permissions";
import { useAuthUser } from "@/hooks/use-rbac";

export function WorkspaceOverviewPage() {
  const { t } = useTranslation("common");
  const { company } = useAuth();
  const { displayName } = useCompanyIdentity(Boolean(company?.id));
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const canView = canAccessWorkspace(hasPermission, isSuperAdmin, Boolean(company?.id));

  if (!canView) {
    return <p className="text-sm text-muted-foreground">{t("workspace.noPermission")}</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("workspace.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("workspace.subtitle")}</p>
      </div>

      <DashboardCard className="space-y-4 p-5">
        <h2 className="font-semibold">{displayName || t("workspace.overview.company")}</h2>
        <p className="text-sm text-muted-foreground">{t("workspace.overview.hint")}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link href={nestedSectionHref("/billing")}>{t("workspace.nav.billing")}</Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href={nestedSectionHref("/usage")}>{t("workspace.nav.usage")}</Link>
          </Button>
        </div>
      </DashboardCard>
    </div>
  );
}
