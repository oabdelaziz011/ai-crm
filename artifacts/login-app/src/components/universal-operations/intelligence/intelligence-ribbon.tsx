import { memo } from "react";
import { ChevronRight } from "lucide-react";
import type { JourneyStepState } from "@workspace/universal-operations-engine";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

export const IntelligenceContextRibbon = memo(function IntelligenceContextRibbon({
  steps,
}: {
  steps: JourneyStepState[];
}) {
  const { t } = useTranslation("common");
  return (
    <div className="overflow-x-auto rounded-xl border border-border/50 bg-muted/20 px-3 py-2.5 scrollbar-none">
      <div className="flex min-w-max items-center gap-1">
        {steps.map((step, i) => (
          <div key={step.id} className="flex items-center gap-1">
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide",
                step.status === "completed" && "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
                step.status === "current" && "bg-primary/20 text-primary ring-1 ring-primary/30",
                step.status === "upcoming" && "bg-muted/50 text-muted-foreground",
              )}
            >
              {t(`intelligence.journey.${step.id}`, step.label)}
            </span>
            {i < steps.length - 1 && <ChevronRight className="size-3 shrink-0 text-muted-foreground/50" />}
          </div>
        ))}
      </div>
    </div>
  );
});

export const IntelligenceQuickDecisionBar = memo(function IntelligenceQuickDecisionBar({
  outstandingCents,
  status,
  employee,
  room,
  priority,
  risk,
  nextAction,
}: {
  outstandingCents: number;
  status: string;
  employee: string;
  room: string;
  priority: string;
  risk: string;
  nextAction: string;
}) {
  const { t } = useTranslation("common");
  return (
    <div className="sticky top-[calc(var(--c360-header-h,7rem)+2.5rem)] z-10 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 backdrop-blur-sm">
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
        <div><span className="text-muted-foreground">{t("intelligence.quickDecision.status")}</span> <span className="font-semibold">{status}</span></div>
        <div><span className="text-muted-foreground">{t("intelligence.quickDecision.outstanding")}</span> <span className="font-mono font-semibold">${(outstandingCents / 100).toFixed(2)}</span></div>
        <div><span className="text-muted-foreground">{t("intelligence.quickDecision.employee")}</span> <span className="font-semibold">{employee}</span></div>
        <div><span className="text-muted-foreground">{t("intelligence.quickDecision.room")}</span> <span className="font-semibold">{room}</span></div>
        <div><span className="text-muted-foreground">{t("intelligence.quickDecision.priority")}</span> <span className="font-semibold">{priority}</span></div>
        <div><span className="text-muted-foreground">{t("intelligence.quickDecision.risk")}</span> <span className="font-semibold capitalize">{risk}</span></div>
      </div>
      <p className="mt-2 truncate text-xs font-medium text-primary">→ {nextAction}</p>
    </div>
  );
});
