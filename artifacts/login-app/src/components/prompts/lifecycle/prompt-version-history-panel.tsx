import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { DashboardCard } from "@/components/dashboard/ui";
import type { PromptTemplateRecord, PromptTemplateVersionRecord } from "@workspace/ai-prompt-orchestrator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRollbackPromptVersion } from "@/hooks/prompts/use-prompt-mutations";
import { translatePromptTemplateName } from "@/lib/prompts/prompt-i18n";

type Props = {
  template: PromptTemplateRecord;
  versions: PromptTemplateVersionRecord[];
  canRollback?: boolean;
};

export function PromptVersionHistoryPanel({ template, versions, canRollback = false }: Props) {
  const { t } = useTranslation("common");
  const rollback = useRollbackPromptVersion();

  const handleRollback = async (versionId: string) => {
    try {
      await rollback.mutateAsync({ templateId: template.id, versionId });
      toast.success(t("prompts.versions.rollbackSuccess"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("prompts.errors.rollbackFailed"));
    }
  };

  return (
    <DashboardCard className="p-4 space-y-3">
      <div>
        <h3 className="font-semibold">{t("prompts.versions.title")}</h3>
        <p className="text-sm text-muted-foreground">
          {translatePromptTemplateName(t, template.key, template.display_name)}
        </p>
      </div>

      {versions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("prompts.versions.empty")}</p>
      ) : (
        <div className="space-y-2">
          {versions.map((version) => (
            <div key={version.id} className="rounded-md border p-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{version.version_label}</span>
                {version.is_active ? <Badge>{t("prompts.versions.active")}</Badge> : null}
                {version.lifecycle_status ? (
                  <Badge variant="outline">
                    {t(`prompts.lifecycle.${version.lifecycle_status}`, {
                      defaultValue: version.lifecycle_status,
                    })}
                  </Badge>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {format(new Date(version.created_at), "PPp")}
              </p>
              {version.change_notes ? (
                <p className="text-sm text-muted-foreground">{version.change_notes}</p>
              ) : null}
              {canRollback && !version.is_active ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={rollback.isPending}
                  onClick={() => void handleRollback(version.id)}
                >
                  {t("prompts.versions.rollback")}
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </DashboardCard>
  );
}
