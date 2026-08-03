import { memo } from "react";
import { Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { WorkspaceWidgetSnapshot } from "@workspace/universal-workspace-platform";
import { cn } from "@/lib/utils";

function WidgetCard({ widget }: { widget: WorkspaceWidgetSnapshot }) {
  const { t } = useTranslation("common");
  const data = Array.isArray(widget.data) ? widget.data : [];

  return (
    <div className="rounded-2xl border border-border/60 bg-card/90 p-4 shadow-sm transition-shadow hover:shadow-md">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {t(`workspacePlatform.${widget.title}`)}
      </p>
      <div className="mt-3 space-y-2">
        {data.map((point) => (
          <div key={point.id} className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-muted-foreground">{point.label}</span>
            <div className="flex items-baseline gap-1.5">
              <span
                className={cn(
                  "font-mono text-sm font-bold tabular-nums",
                  point.tone === "success" && "text-emerald-500",
                  point.tone === "warning" && "text-amber-500",
                  point.tone === "danger" && "text-red-500",
                )}
              >
                {point.value}
              </span>
              {point.trend && (
                <span className="flex items-center text-[9px] text-muted-foreground">
                  {String(point.trend).startsWith("+") ? (
                    <TrendingUp className="size-2.5 text-emerald-500" />
                  ) : String(point.trend).startsWith("-") ? (
                    <TrendingDown className="size-2.5 text-red-500" />
                  ) : null}
                  {point.trend}
                </span>
              )}
            </div>
          </div>
        ))}
        {data.length === 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="size-3.5" />
            {t("workspacePlatform.widgets.noData")}
          </div>
        )}
      </div>
    </div>
  );
}

export const WorkspaceWidgetsGrid = memo(function WorkspaceWidgetsGrid({
  widgets,
}: {
  widgets: WorkspaceWidgetSnapshot[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {widgets.map((w) => (
        <WidgetCard key={w.widgetId} widget={w} />
      ))}
    </div>
  );
});
