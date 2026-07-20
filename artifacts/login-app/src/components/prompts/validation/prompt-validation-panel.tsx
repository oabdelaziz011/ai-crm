import { useTranslation } from "react-i18next";
import { DashboardCard } from "@/components/dashboard/ui";
import type { PromptValidationIssue } from "@workspace/ai-prompt-orchestrator";
import { Badge } from "@/components/ui/badge";

type Props = {
  issues: PromptValidationIssue[];
};

export function PromptValidationPanel({ issues }: Props) {
  const { t } = useTranslation("common");
  const blocking = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");

  return (
    <DashboardCard className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{t("prompts.validation.title")}</h3>
        {blocking.length === 0 ? (
          <Badge variant="secondary">{t("prompts.validation.ready")}</Badge>
        ) : (
          <Badge variant="destructive">{t("prompts.validation.blocked")}</Badge>
        )}
      </div>

      {issues.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("prompts.validation.noIssues")}</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {blocking.map((issue) => (
            <li key={issue.id} className="text-destructive">{issue.message}</li>
          ))}
          {warnings.map((issue) => (
            <li key={issue.id} className="text-muted-foreground">{issue.message}</li>
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}
