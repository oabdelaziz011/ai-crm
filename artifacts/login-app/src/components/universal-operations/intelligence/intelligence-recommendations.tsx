import { memo } from "react";
import { Sparkles } from "lucide-react";
import type { IntelligenceRecommendation, MiniKpiCard } from "@workspace/universal-operations-engine";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import {
  translateRecommendationReason,
  translateRecommendationTitle,
} from "@/lib/i18n/workspace-mock-labels";
import { cn } from "@/lib/utils";

export const IntelligenceRecommendations = memo(function IntelligenceRecommendations({
  recommendations,
}: {
  recommendations: IntelligenceRecommendation[];
}) {
  const { t } = useTranslation("common");
  return (
    <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/8 to-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <p className="text-sm font-semibold">{t("intelligence.recommendations")}</p>
      </div>
      <div className="space-y-2">
        {recommendations.map((rec) => (
          <div key={rec.id} className="rounded-xl border border-border/50 bg-background/40 p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium">{translateRecommendationTitle(t, rec.labelKey, rec.title)}</p>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{Math.round(rec.confidence * 100)}%</span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {translateRecommendationReason(t, rec.id, rec.reason)}
            </p>
            <Button size="sm" variant="outline" className="mt-2 h-7 text-[10px]" disabled>
              {t("intelligence.confirmAction")}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
});

export const IntelligenceMiniKpis = memo(function IntelligenceMiniKpis({ kpis }: { kpis: MiniKpiCard[] }) {
  const { t } = useTranslation("common");
  return (
    <div className="grid grid-cols-2 gap-2">
      {kpis.map((kpi) => (
        <div key={kpi.id} className="rounded-xl border border-border/50 bg-card/80 px-3 py-2">
          <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{t(`intelligence.${kpi.labelKey}`)}</p>
          <p className="mt-0.5 font-mono text-sm font-bold tabular-nums">{kpi.value}</p>
          <p className={cn("text-[9px]", kpi.trendDirection === "up" && "text-emerald-500", kpi.trendDirection === "down" && "text-red-500", kpi.trendDirection === "flat" && "text-muted-foreground")}>
            {kpi.trend}
          </p>
        </div>
      ))}
    </div>
  );
});
