import { Link, useLocation } from "wouter";
import { FileText, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { DashboardCard, DashboardErrorBanner, DashboardTableSkeleton } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { usePromptLibraryPresets } from "@/hooks/prompts/use-prompt-preview";
import { useCreatePromptFromPreset } from "@/hooks/prompts/use-prompt-mutations";
import { usePromptTemplates } from "@/hooks/prompts/use-prompt-templates";
import { usePermissions } from "@/hooks/use-rbac";
import { canManagePrompts, canViewPrompts } from "@/lib/prompts/prompt-permissions";
import { nestedSectionHref } from "@/lib/routing";

export function PromptLibraryPage() {
  const { t } = useTranslation("common");
  const { company } = useAuth();
  const [, setLocation] = useLocation();
  const { hasPermission, isSuperAdmin } = usePermissions();
  const companyId = company?.id ?? null;
  const canView = canViewPrompts(hasPermission, isSuperAdmin);
  const canManage = canManagePrompts(hasPermission, isSuperAdmin);
  const { data: templates = [], isLoading, error } = usePromptTemplates(companyId, canView);
  const presets = usePromptLibraryPresets();
  const createFromPreset = useCreatePromptFromPreset();

  const existingKeys = new Set(templates.filter((item) => item.company_id === companyId).map((item) => item.key));

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

  const handleCreateFromPreset = async (preset: (typeof presets)[number]) => {
    if (!companyId) {
      toast.error(t("prompts.errors.companyRequired"));
      return;
    }
    if (existingKeys.has(preset.key)) {
      toast.error(t("prompts.errors.alreadyExists", { key: preset.key }));
      return;
    }

    try {
      const result = await createFromPreset.mutateAsync({
        companyId,
        key: preset.key,
        displayName: preset.displayName,
        description: preset.description,
        templateType: preset.templateType,
        sectionOrder: [...preset.sectionOrder],
        sections: preset.sections,
      });
      toast.success(t("prompts.library.created", { name: preset.displayName }));
      setLocation(nestedSectionHref(`/editor/${result.template.id}`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("prompts.errors.createFailed"));
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <DashboardCard className="p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{t("prompts.library.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("prompts.library.subtitle")}</p>
        </div>

        {templates.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center space-y-2">
            <p className="font-medium">{t("prompts.library.emptyTitle")}</p>
            <p className="text-sm text-muted-foreground">{t("prompts.library.empty")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {templates.map((template) => {
              const isSystem = template.company_id === null;
              return (
                <div key={template.id} className="rounded-lg border p-4 flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <p className="font-medium">{template.display_name}</p>
                      {!template.is_enabled ? <Badge variant="secondary">{t("prompts.status.disabled")}</Badge> : null}
                      {isSystem ? <Badge variant="outline">{t("prompts.status.system")}</Badge> : null}
                      {!isSystem ? <Badge variant="secondary">{t("prompts.status.company")}</Badge> : null}
                    </div>
                    <p className="text-sm text-muted-foreground">{template.description || template.key}</p>
                    <p className="text-xs text-muted-foreground">
                      {template.key} · {template.template_type}
                    </p>
                  </div>
                  {canManage ? (
                    <Button asChild size="sm" variant="secondary">
                      <Link href={nestedSectionHref(`/editor/${template.id}`)}>
                        {isSystem ? t("prompts.library.openPreview") : t("prompts.library.openEditor")}
                      </Link>
                    </Button>
                  ) : null}
                </div>
              );
            })}
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
          {presets.map((preset) => {
            const alreadyCreated = existingKeys.has(preset.key);
            return (
              <div key={preset.key} className="rounded-lg border p-3 space-y-3">
                <div>
                  <p className="font-medium">{preset.displayName}</p>
                  <p className="text-sm text-muted-foreground mt-1">{preset.description}</p>
                </div>
                {canManage ? (
                  <Button
                    size="sm"
                    variant={alreadyCreated ? "outline" : "default"}
                    disabled={!companyId || alreadyCreated || createFromPreset.isPending}
                    onClick={() => void handleCreateFromPreset(preset)}
                  >
                    {alreadyCreated ? t("prompts.library.alreadyAdded") : t("prompts.library.createFromPreset")}
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
      </DashboardCard>
    </div>
  );
}
