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
        "rounded-xl border border-primary/20 bg-gradient-to-br from-primary/8 via-card/80 to-card/60",
        compact ? "p-3" : "p-4",
        className,
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="size-3.5 shrink-0 text-primary" />
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
                className="w-full text-start text-xs leading-snug text-foreground/90 hover:text-primary transition-colors"
              >
                {t(insight.messageKey, insight.params)}
              </button>
            ) : (
              <p className="text-xs leading-snug text-foreground/90">
                {t(insight.messageKey, insight.params)}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
