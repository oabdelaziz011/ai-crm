import { memo } from "react";
import { useTranslation } from "react-i18next";
import { getQuickActionsForPage } from "@/lib/floating-ai/quick-actions-registry";
import type { FloatingAiQuickAction } from "@/lib/floating-ai/types";

type QuickActionsProps = {
  page: string;
  onAction: (action: FloatingAiQuickAction) => void;
  disabled?: boolean;
};

export const QuickActions = memo(function QuickActions({ page, onAction, disabled }: QuickActionsProps) {
  const { t } = useTranslation("common");
  const actions = getQuickActionsForPage(page).slice(0, 4);

  if (actions.length === 0) return null;

  return (
    <div className="shrink-0 border-t border-border/40 px-3 py-2" role="group" aria-label={t("floatingAi.quickActions.label")}>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {t("floatingAi.quickActions.title")}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            disabled={disabled}
            onClick={() => onAction(action)}
            className="rounded-lg border border-border bg-background/80 px-2.5 py-1 text-xs text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 disabled:opacity-50"
          >
            {t(action.labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
});
