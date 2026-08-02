import { memo } from "react";
import { useIntelligenceContext } from "@/components/omnichannel/workspace-v2/intelligence/intelligence-context";
import { EnterpriseCard } from "@/components/omnichannel/workspace-v2/intelligence/enterprise-card";
import { scoreColorClass } from "@/components/omnichannel/workspace-v2/intelligence/intelligence-ui";

function KpiCell({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--ws-border-subtle)] bg-[var(--ws-surface)] px-2 py-1.5 transition-colors hover:border-[var(--ws-accent)]/30">
      <p className="mb-0.5 text-[9px] text-[var(--ws-muted)]">{icon} {label}</p>
      <p className={`text-[11px] font-semibold tabular-nums ${value.includes("%") && label.includes("Satisfaction") ? scoreColorClass(Number.parseInt(value, 10) || 0) : "text-[var(--ws-text)]"}`}>
        {value}
      </p>
    </div>
  );
}

export const IntelligenceKpiStrip = memo(function IntelligenceKpiStrip() {
  const { viewModel, labels, dir } = useIntelligenceContext();
  const kpi = viewModel.v2.kpiStrip;
  const v2 = labels.v2;

  return (
    <div dir={dir}>
      <EnterpriseCard className="mb-1.5 grid grid-cols-2 gap-1 p-1.5 sm:grid-cols-3">
      <KpiCell icon="⏱" label={v2.kpiDuration} value={kpi.durationLabel} />
      <KpiCell icon="💬" label={v2.kpiMessages} value={String(kpi.messageCount)} />
      <KpiCell icon="⚡" label={v2.kpiFirstReply} value={kpi.firstReplyLabel} />
      <KpiCell icon="🤖" label={v2.kpiAiPercent} value={`${kpi.aiPercent}%`} />
      <KpiCell icon="👤" label={v2.kpiHumanPercent} value={`${kpi.humanPercent}%`} />
      <KpiCell icon="⭐" label={v2.kpiSatisfaction} value={`${kpi.satisfaction}%`} />
      </EnterpriseCard>
    </div>
  );
});
