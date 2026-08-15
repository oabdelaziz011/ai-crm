import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { WorkspaceAiInsight } from "@/lib/customer-workspace/customer-workspace-utils";
import { cn } from "@/lib/utils";

type Props = {
  insights: WorkspaceAiInsight[];
  compact?: boolean;
  className?: string;
  onInsightAction?: (insight: WorkspaceAiInsight) => void;
};

export function WorkspaceAiInsights({ insights, compact, className, onInsightAction }: Props) {
  const { t } = useTranslation("common");

  if (insights.length === 0) return null;

  return (
    <div
      className={cn(
        "rounded-2xl border border-primary/20 bg-primary/5 shadow-sm",
        compact ? "p-3" : "p-4",
        className,
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <div className="flex size-6 items-center justify-center rounded-md bg-primary/15">
          <Sparkles className="size-3.5 shrink-0 text-primary" />
        </div>
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-primary">
          {t("dashboard.customerWorkspace.aiInsights.label")}
        </p>
      </div>
      <ul className={cn("space-y-1.5", compact && "space-y-1")}>
        {insights.slice(0, compact ? 2 : 4).map((insight) => (
          <li key={insight.id}>
            {insight.actionTab && onInsightAction ? (
              <button
                type="button"
                onClick={() => onInsightAction(insight)}
                className="w-full rounded-lg px-1.5 py-1 text-start text-xs leading-snug text-foreground/90 transition-colors hover:bg-primary/10 hover:text-primary"
              >
                {t(insight.messageKey, insight.params)}
              </button>
            ) : (
              <p className="px-1.5 text-xs leading-snug text-foreground/90">
                {t(insight.messageKey, insight.params)}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
