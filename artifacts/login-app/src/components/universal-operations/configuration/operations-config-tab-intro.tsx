import { useTranslation } from "react-i18next";
import type { OperationsConfigTab } from "@workspace/universal-operations-engine";

type Props = {
  tab: OperationsConfigTab;
};

export function OperationsConfigTabIntro({ tab }: Props) {
  const { t } = useTranslation("common");

  return (
    <div className="rounded-lg border border-border/50 bg-card/40 px-4 py-3">
      <h3 className="text-sm font-semibold">{t(`universalOperations.configuration.tabs.${tab}`)}</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {t(`universalOperations.configuration.tabDescriptions.${tab}`)}
      </p>
    </div>
  );
}
