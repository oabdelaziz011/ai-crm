import { memo } from "react";
import { useIntelligenceContext } from "@/components/omnichannel/workspace-v2/intelligence/intelligence-context";
import { EnterpriseCard, EnterpriseCardTitle } from "@/components/omnichannel/workspace-v2/intelligence/enterprise-card";
import {
  ConfidenceBar,
  MiniSparkline,
  ProgressRing,
  scoreColorClass,
} from "@/components/omnichannel/workspace-v2/intelligence/intelligence-ui";

export const IntelligenceMoodTab = memo(function IntelligenceMoodTab() {
  const { viewModel, labels, dir } = useIntelligenceContext();
  const { satisfaction } = viewModel.v2;
  const v2 = labels.v2;

  return (
    <div className="space-y-3" dir={dir}>
      <EnterpriseCard accent="violet" className="p-4 transition-shadow hover:shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
        <p className="mb-3 text-center text-[10px] font-medium uppercase tracking-wide text-[var(--ws-muted)]">
          {v2.satisfactionTitle}
        </p>
        <div className="flex flex-col items-center gap-3">
          <ProgressRing value={satisfaction.score} size={72} className={scoreColorClass(satisfaction.score)}>
            <div className="text-center">
              <p className={`text-xl font-bold tabular-nums ${scoreColorClass(satisfaction.score)}`}>
                {satisfaction.score}%
              </p>
            </div>
          </ProgressRing>
          <p className={`text-sm font-semibold ${scoreColorClass(satisfaction.score)}`}>{satisfaction.bandLabel}</p>
          <p className="text-[11px] text-[var(--ws-muted)]">
            Trend {satisfaction.trendArrow}
          </p>
        </div>
        <div className="mt-4 border-t border-[var(--ws-border-subtle)] pt-3">
          <div className="mb-1 flex items-center justify-between text-[10px]">
            <span className="text-[var(--ws-muted)]">{v2.confidenceTitle}</span>
            <span className="font-medium tabular-nums">{satisfaction.confidence}%</span>
          </div>
          <ConfidenceBar value={satisfaction.confidence} />
        </div>
      </EnterpriseCard>

      <EnterpriseCard>
        <EnterpriseCardTitle>{v2.analysisReasonTitle}</EnterpriseCardTitle>
        <MiniSparkline values={[satisfaction.score - 8, satisfaction.score - 3, satisfaction.score, satisfaction.score + 2].map((v) => Math.max(10, v))} />
        {satisfaction.positiveReasons.length > 0 ? (
          <div className="mt-3">
            <p className="mb-1.5 text-[9px] font-medium uppercase tracking-wide text-emerald-400">{v2.positiveSignals}</p>
            <ul className="space-y-1">
              {satisfaction.positiveReasons.map((reason) => (
                <li key={reason} className="text-[10px] leading-relaxed text-[var(--ws-text)]" dir="auto">
                  • {reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {satisfaction.negativeReasons.length > 0 ? (
          <div className="mt-3">
            <p className="mb-1.5 text-[9px] font-medium uppercase tracking-wide text-orange-400">{v2.negativeSignals}</p>
            <ul className="space-y-1">
              {satisfaction.negativeReasons.map((reason) => (
                <li key={reason} className="text-[10px] leading-relaxed text-[var(--ws-text)]" dir="auto">
                  • {reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </EnterpriseCard>
    </div>
  );
});
