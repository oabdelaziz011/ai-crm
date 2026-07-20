import { Link } from "wouter";
import { FileText, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DashboardCard, DashboardErrorBanner, DashboardTableSkeleton } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { usePromptLibraryPresets } from "@/hooks/prompts/use-prompt-preview";
import { usePromptTemplates } from "@/hooks/prompts/use-prompt-templates";
import { usePermissions } from "@/hooks/use-rbac";
import { canManagePrompts, canViewPrompts } from "@/lib/prompts/prompt-permissions";

export function PromptLibraryPage() {
  const { t } = useTranslation("common");
  const { company } = useAuth();
  const { hasPermission, isSuperAdmin } = usePermissions();
  const companyId = company?.id ?? null;
  const canView = canViewPrompts(hasPermission, isSuperAdmin);
  const canManage = canManagePrompts(hasPermission, isSuperAdmin);
  const { data: templates = [], isLoading, error } = usePromptTemplates(companyId, canView);
  const presets = usePromptLibraryPresets();

  if (!canView) {
    return <DashboardErrorBanner message={t("prompts.noPermission")} />;
  }

  if (isLoading) {
    return (
      <DashboardCard className="p-6">
        <DashboardTableSkeleton rows={5} />
      </DashboardCard>
    );
  }

  if (error) {
    return <DashboardErrorBanner message={error.message} />;
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <DashboardCard className="p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t("prompts.library.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("prompts.library.subtitle")}</p>
          </div>
        </div>

        {templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("prompts.library.empty")}</p>
        ) : (
          <div className="space-y-3">
            {templates.map((template) => (
              <div key={template.id} className="rounded-lg border p-4 flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <p className="font-medium">{template.display_name}</p>
                    {!template.is_enabled ? <Badge variant="secondary">{t("prompts.status.disabled")}</Badge> : null}
                    {template.company_id === null ? <Badge variant="outline">{t("prompts.status.system")}</Badge> : null}
                  </div>
                  <p className="text-sm text-muted-foreground">{template.description || template.key}</p>
                  <p className="text-xs text-muted-foreground">{template.template_type}</p>
                </div>
                {canManage ? (
                  <Button asChild size="sm" variant="secondary">
                    <Link href={`/dashboard/prompts/editor/${template.key}`}>{t("prompts.library.openEditor")}</Link>
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </DashboardCard>

      <DashboardCard className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          <h2 className="text-lg font-semibold">{t("prompts.templates.title")}</h2>
        </div>
        <p className="text-sm text-muted-foreground">{t("prompts.templates.subtitle")}</p>
        <div className="space-y-3">
          {presets.map((preset) => (
            <div key={preset.key} className="rounded-lg border p-3">
              <p className="font-medium">{preset.displayName}</p>
              <p className="text-sm text-muted-foreground mt-1">{preset.description}</p>
            </div>
          ))}
        </div>
      </DashboardCard>
    </div>
  );
}
