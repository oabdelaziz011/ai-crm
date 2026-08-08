import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkflowStep } from "@/lib/universal-operations/widget-registry/workflow-steps";

export function OperationWorkflowStrip({
  steps,
  currentIndex,
  compact = false,
}: {
  steps: WorkflowStep[];
  currentIndex: number;
  compact?: boolean;
}) {
  const { t } = useTranslation("common");

  return (
    <ol className={cn("flex flex-wrap items-center gap-1", compact ? "gap-1" : "gap-1.5")}>
      {steps.map((step, index) => {
        const done = index < currentIndex;
        const current = index === currentIndex;
        return (
          <li key={step.id} className="flex items-center gap-1">
            <div
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
                done && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                current && "border-primary/40 bg-primary/10 text-primary",
                !done && !current && "border-border/60 bg-muted/20 text-muted-foreground",
              )}
            >
              {done ? <Check className="size-3" /> : <span className="size-1.5 rounded-full bg-current opacity-70" />}
              {t(step.labelKey)}
            </div>
            {index < steps.length - 1 && (
              <span className="px-0.5 text-[10px] text-muted-foreground" aria-hidden>
                ↓
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
