import { useTranslation } from "react-i18next";
import { DashboardCard } from "@/components/dashboard/ui";

type Props = {
  renderedPrompt: string;
  estimatedTokens: number;
  variableCount: number;
};

export function PromptPreviewPanel({ renderedPrompt, estimatedTokens, variableCount }: Props) {
  const { t } = useTranslation("common");

  return (
    <DashboardCard className="p-4 space-y-3">
      <div>
        <h3 className="font-semibold">{t("prompts.preview.title")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("prompts.preview.meta", { tokens: estimatedTokens, variables: variableCount })}
        </p>
      </div>
      <pre className="max-h-[420px] overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">
        {renderedPrompt || t("prompts.preview.empty")}
      </pre>
    </DashboardCard>
  );
}
