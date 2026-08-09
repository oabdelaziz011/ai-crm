import { useTranslation } from "react-i18next";
import { translateLeadStageLabel } from "@/components/leads/kanban/lead-stage-label";
import { cn } from "@/lib/utils";

const STAGE_ACCENTS = [
  "bg-sky-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-orange-500",
  "bg-emerald-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-indigo-500",
];

export type LeadPipelineStageCardModel = {
  id: string;
  name: string;
  slug?: string | null;
  lifecycleStatus?: string | null;
  leadCount?: number | null;
  probabilityPercent: number;
  totalValue?: number | null;
};

/**
 * Compact stage probability cards — replaces the dedicated Pipeline tab on Kanban.
 */
export function LeadPipelineStageCards({
  stages,
  className,
}: {
  stages: readonly LeadPipelineStageCardModel[];
  className?: string;
}) {
  const { t } = useTranslation("common");

  if (!stages.length) return null;

  return (
    <section
      className={cn("space-y-2.5", className)}
      aria-label={t("leads.pipeline.stages")}
    >
      <div className="flex items-baseline justify-between gap-3 px-0.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {t("leads.kanban.stageProbability.title")}
        </h3>
        <p className="text-[11px] text-muted-foreground">
          {t("leads.kanban.stageProbability.hint")}
        </p>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {stages.map((stage, index) => {
          const percent = Math.max(0, Math.min(100, stage.probabilityPercent ?? 0));
          const accent = STAGE_ACCENTS[index % STAGE_ACCENTS.length];
          return (
            <article
              key={stage.id}
              className="rounded-2xl border border-border/50 bg-card/70 p-3.5 shadow-sm transition-colors hover:bg-card"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold tracking-tight text-foreground">
                    {translateLeadStageLabel(t, stage)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {t("leads.pipeline.stageLeads", { count: stage.leadCount ?? 0 })}
                  </p>
                </div>
                <div className="shrink-0 text-end">
                  <p className="text-[18px] font-semibold tabular-nums tracking-tight text-foreground">
                    {percent}
                    <span className="ms-0.5 text-[11px] font-medium text-muted-foreground">%</span>
                  </p>
                </div>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full transition-[width] duration-500", accent)}
                  style={{ width: `${percent}%` }}
                />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
