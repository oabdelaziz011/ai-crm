import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { DashboardCard } from "@/components/dashboard/ui";
import type { PromptTemplateRecord, PromptTemplateVersionRecord } from "@workspace/ai-prompt-orchestrator";
import { Badge } from "@/components/ui/badge";

type Props = {
  template: PromptTemplateRecord;
  versions: PromptTemplateVersionRecord[];
};

export function PromptVersionHistoryPanel({ template, versions }: Props) {
  const { t } = useTranslation("common");

  return (
    <DashboardCard className="p-4 space-y-3">
      <div>
        <h3 className="font-semibold">{t("prompts.versions.title")}</h3>
        <p className="text-sm text-muted-foreground">{template.display_name}</p>
      </div>

      {versions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("prompts.versions.empty")}</p>
      ) : (
        <div className="space-y-2">
          {versions.map((version) => (
            <div key={version.id} className="rounded-md border p-3 space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{version.version_label}</span>
                {version.is_active ? <Badge>{t("prompts.versions.active")}</Badge> : null}
                {version.lifecycle_status ? (
                  <Badge variant="outline">{version.lifecycle_status}</Badge>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {format(new Date(version.created_at), "PPp")}
              </p>
              {version.change_notes ? (
                <p className="text-sm text-muted-foreground">{version.change_notes}</p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </DashboardCard>
  );
}
