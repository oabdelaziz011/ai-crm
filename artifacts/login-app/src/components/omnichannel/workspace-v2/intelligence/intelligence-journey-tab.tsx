import { memo } from "react";
import { Map } from "lucide-react";
import { useIntelligenceContext } from "@/components/omnichannel/workspace-v2/intelligence/intelligence-context";
import { EnterpriseCard, EnterpriseCardTitle } from "@/components/omnichannel/workspace-v2/intelligence/enterprise-card";
import { statusToneClass, TimelineRail } from "@/components/omnichannel/workspace-v2/intelligence/intelligence-ui";
import { cn } from "@/lib/utils";

function stageTone(state: "completed" | "current" | "upcoming"): "healthy" | "warning" | "resolved" | "closed" | "escalated" | "default" {
  if (state === "completed") return "resolved";
  if (state === "current") return "healthy";
  return "default";
}

export const IntelligenceJourneyTab = memo(function IntelligenceJourneyTab() {
  const { viewModel, panelLabels: labels, dir } = useIntelligenceContext();
  const stages = viewModel.v2.journeyStages;

  if (stages.length === 0) {
    return (
      <p className="py-8 text-center text-[10px] text-[var(--ws-muted)]" dir={dir}>
        {labels.empty}
      </p>
    );
  }

  return (
    <div dir={dir}>
      <EnterpriseCard accent="violet" className="overflow-hidden p-0">
        <div className="border-b border-[var(--ws-border-subtle)] px-3 py-2">
          <EnterpriseCardTitle icon={<Map className="size-3.5 text-[var(--ws-violet)]" />} className="mb-0">
            {labels.journeyTitle}
          </EnterpriseCardTitle>
        </div>

        <ol className="px-3 py-3">
          {stages.map((stage, index) => {
            const tone = stage.state === "current" ? "healthy" : stage.state === "completed" ? "resolved" : stage.tone === "escalated" ? "escalated" : stage.tone === "closed" ? "closed" : stageTone(stage.state);

            return (
              <li key={stage.id} className="flex gap-3">
                <TimelineRail isFirst={index === 0} isLast={index === stages.length - 1} tone={tone} />
                <div
                  className={cn(
                    "mb-2 min-w-0 flex-1 rounded-lg border px-3 py-2 transition-all duration-200 hover:translate-x-0.5",
                    stage.state === "current"
                      ? "border-emerald-400/40 bg-emerald-500/10"
                      : stage.state === "completed"
                        ? "border-sky-400/30 bg-sky-500/5"
                        : "border-[var(--ws-border-subtle)] bg-[var(--ws-surface)] opacity-70",
                  )}
                >
                  <p className="text-[11px] font-semibold leading-snug" dir="auto">
                    {stage.label}
                  </p>
                  <span className={cn("mt-1 inline-flex rounded px-1.5 py-0.5 text-[8px] font-medium", statusToneClass(tone === "default" ? "healthy" : tone))}>
                    {stage.state === "completed" ? "✓" : stage.state === "current" ? "●" : "○"}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </EnterpriseCard>
    </div>
  );
});
