import { memo } from "react";
import { AlertTriangle, Check, Circle } from "lucide-react";
import type { OperationalAlert, OperationalHealthMetric, WorkflowStageState } from "@workspace/universal-operations-engine";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

export const IntelligenceOperationalHealth = memo(function IntelligenceOperationalHealth({
  metrics,
}: {
  metrics: OperationalHealthMetric[];
}) {
  const { t } = useTranslation("common");
  return (
    <div className="rounded-2xl border border-border/60 bg-card/90 p-4 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {t("intelligence.operationalHealth")}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {metrics.map((m) => (
          <div key={m.id} className="rounded-lg border border-border/40 bg-background/30 px-2.5 py-2">
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{t(`intelligence.${m.labelKey}`)}</p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className={cn("font-mono text-sm font-bold tabular-nums", m.tone === "success" && "text-emerald-500", m.tone === "warning" && "text-amber-500", m.tone === "danger" && "text-red-500")}>
                {m.value}
              </span>
              {m.trend && <span className="text-[9px] text-muted-foreground">{m.trend}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

export const IntelligenceAlerts = memo(function IntelligenceAlerts({ alerts }: { alerts: OperationalAlert[] }) {
  if (alerts.length === 0) return null;
  return (
    <div className="space-y-2">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className="flex gap-3 rounded-xl border px-3 py-2.5"
          style={{ borderColor: `${alert.color}44`, backgroundColor: `${alert.color}11` }}
        >
          <AlertTriangle className="size-4 shrink-0" style={{ color: alert.color }} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold">{alert.title}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{alert.message}</p>
          </div>
          {alert.actionKey && (
            <Button size="sm" variant="outline" className="h-7 shrink-0 text-[10px]" disabled>
              Action
            </Button>
          )}
        </div>
      ))}
    </div>
  );
});

export const IntelligenceWorkflowTracker = memo(function IntelligenceWorkflowTracker({
  stages,
}: {
  stages: WorkflowStageState[];
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/90 p-4">
      <div className="flex flex-col gap-2">
        {stages.map((stage) => (
          <div key={stage.id} className="flex items-center gap-2.5">
            {stage.state === "done" ? (
              <Check className="size-4 text-emerald-500" />
            ) : stage.state === "active" ? (
              <Circle className="size-4 fill-amber-400 text-amber-400" />
            ) : (
              <Circle className="size-4 text-muted-foreground/40" />
            )}
            <span className={cn("text-sm", stage.state === "active" && "font-semibold text-amber-600 dark:text-amber-400", stage.state === "done" && "text-muted-foreground")}>
              {stage.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
});
