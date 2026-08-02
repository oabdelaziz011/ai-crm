import { memo } from "react";
import { Gauge } from "lucide-react";
import { useIntelligenceContext } from "@/components/omnichannel/workspace-v2/intelligence/intelligence-context";
import { EnterpriseCard } from "@/components/omnichannel/workspace-v2/intelligence/enterprise-card";

function scoreRingClass(band: string): string {
  if (band === "excellent") return "text-emerald-400";
  if (band === "good") return "text-[var(--ws-accent)]";
  if (band === "fair") return "text-[var(--ws-warn)]";
  return "text-[var(--ws-danger)]";
}

export const IntelligenceScoreCard = memo(function IntelligenceScoreCard() {
  const { viewModel, polishLabels, dir } = useIntelligenceContext();
  const { score } = viewModel;

  return (
    <EnterpriseCard accent="violet" className="mb-2 p-3">
      <div className="flex items-center gap-3" dir={dir}>
        <div
          className={`relative flex size-14 shrink-0 items-center justify-center rounded-full border-2 bg-[var(--ws-surface)] ${scoreRingClass(score.band)}`}
          style={{
            borderColor: "currentColor",
            boxShadow: "inset 0 0 0 4px rgba(255,255,255,0.03)",
          }}
        >
          <span className="text-lg font-bold tabular-nums">{score.value}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="mb-0.5 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-[var(--ws-muted)]">
            <Gauge className="size-3" />
            {polishLabels.scoreTitle}
          </p>
          <p className={`text-sm font-semibold ${scoreRingClass(score.band)}`}>{score.label}</p>
        </div>
      </div>
    </EnterpriseCard>
  );
});
