import { useTranslation } from "react-i18next";
import { DashboardCard } from "@/components/dashboard/ui";
import { usePromptVariableCatalog } from "@/hooks/prompts/use-prompt-preview";
import { Badge } from "@/components/ui/badge";

export function PromptVariableBrowser() {
  const { t } = useTranslation("common");
  const variables = usePromptVariableCatalog();

  return (
    <DashboardCard className="p-4 space-y-3">
      <div>
        <h3 className="font-semibold">{t("prompts.variables.title")}</h3>
        <p className="text-sm text-muted-foreground">{t("prompts.variables.subtitle")}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {variables.map((variable) => (
          <Badge key={variable} variant="secondary">{`{{${variable}}}`}</Badge>
        ))}
      </div>
    </DashboardCard>
  );
}
